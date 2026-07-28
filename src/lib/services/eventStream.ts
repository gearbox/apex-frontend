import type { QueryClient } from '@tanstack/svelte-query';
import * as m from '$paraglide/messages';
import apiClient from '$lib/api/client';
import { API_BASE_URL } from '$lib/utils/constants';
import {
  SSE_RECONNECT_BASE_MS,
  SSE_RECONNECT_MAX_MS,
  SSE_MAX_CONSECUTIVE_FAILURES,
  SSE_FALLBACK_RETRY_MS,
  TERMINAL_JOB_STATUSES,
} from '$lib/utils/constants';
import { setEventStreamStatus } from '$lib/stores/eventStream';
import { addNotification } from '$lib/stores/notifications';
import { activeJobStore } from '$lib/stores/jobs';
import { generationStore } from '$lib/stores/generation';
import { addToast } from '$lib/stores/toasts';
import { pushNudge } from '$lib/stores/pushNudge.svelte';
import { jobKeys } from '$lib/queries/jobs';
import { billingKeys } from '$lib/queries/billing';
import { libraryKeys, projectKeys } from '$lib/queries/library';
import { inheritProjectForCompletedJobId } from '$lib/services/projectInheritance';
import { getPendingPaymentScope, reconcilePendingPayments } from '$lib/stores/pendingPayments';
import { fetchPendingPaymentTransactions } from './pendingPaymentReconciliation';
import {
  SSE_EVENTS,
  KNOWN_TRANSACTION_TYPES,
  isJobStatusPayload,
  isJobProgressPayload,
  isBalanceUpdatedPayload,
  isSystemNotificationPayload,
  isGpuSessionStatusPayload,
  isGpuSessionCreditWarningPayload,
  type JobStatusPayload,
  type JobProgressPayload,
  type BalanceUpdatedPayload,
  type GpuSessionStatusPayload,
  type GpuSessionCreditWarningPayload,
} from '$lib/api/events';
import {
  upsertCreditWarning,
  dismissCreditWarning,
  dismissAllCreditWarnings,
} from '$lib/stores/creditWarnings';
import { sessionKeys } from '$lib/queries/sessions';
import { get } from 'svelte/store';
import { getCurrentUser } from '$lib/stores/auth';
import { getAuthEpoch, isAuthEpochCurrent } from '$lib/stores/authLifecycle';

export interface EventStreamServiceOptions {
  queryClient: QueryClient;
  /** Required by the app layout. Optional only for existing isolated service tests. */
  userId?: string;
}

interface ConnectionIdentity {
  generation: number;
  authEpoch: number;
  userId: string | null;
}

export class EventStreamService {
  private queryClient: QueryClient;
  private eventSource: EventSource | null = null;
  private consecutiveFailures = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private reconciliationRun: Promise<void> | null = null;
  private reconciliationQueued = false;
  private disposed = false;
  private connectionGeneration = 0;
  private readonly userId: string | null;

  constructor(options: EventStreamServiceOptions) {
    this.queryClient = options.queryClient;
    this.userId = options.userId ?? getCurrentUser()?.id ?? null;
  }

  /* ─── Public API ─── */

  async connect(): Promise<void> {
    const connection = this.beginConnection();
    if (!this.isCurrent(connection)) return;
    this.clearTimers();
    this.closeEventSource();
    setEventStreamStatus('connecting');

    try {
      const ticket = await this.obtainTicket();
      if (!this.isCurrent(connection)) return;

      this.openEventSource(ticket, connection);
    } catch (error) {
      if (!this.isCurrent(connection)) return;
      this.handleConnectionFailure(error, connection);
    }
  }

  disconnect(): void {
    this.connectionGeneration += 1;
    this.reconciliationQueued = false;
    this.clearTimers();
    this.closeEventSource();
    setEventStreamStatus('disconnected');
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
  }

  private beginConnection(): ConnectionIdentity {
    this.connectionGeneration += 1;
    return {
      generation: this.connectionGeneration,
      authEpoch: getAuthEpoch(),
      userId: this.userId,
    };
  }

  private isCurrent(connection: ConnectionIdentity): boolean {
    return (
      !this.disposed &&
      connection.generation === this.connectionGeneration &&
      isAuthEpochCurrent(connection.authEpoch) &&
      // The null branch preserves direct unit-test construction. Application construction always
      // supplies userId from the authenticated layout, which is the enforced production path.
      (connection.userId === null || getCurrentUser()?.id === connection.userId)
    );
  }

  /* ─── Ticket Acquisition ─── */

  private async obtainTicket(): Promise<string> {
    const { data, error, response } = await apiClient.POST('/v1/events/sse-ticket');

    if (response.status === 503) {
      throw new SSEUnavailableError('SSE not available (503)');
    }

    if (response.status === 429) {
      throw new SSERateLimitedError('Ticket rate limited');
    }

    if (error || !data) {
      throw new Error(`Failed to obtain SSE ticket: ${response.status}`);
    }

    const ticketData = data as { ticket?: string };
    if (!ticketData.ticket) {
      throw new Error('Invalid ticket response');
    }

    return ticketData.ticket;
  }

  /* ─── EventSource Management ─── */

  private openEventSource(ticket: string, connection: ConnectionIdentity): void {
    if (!this.isCurrent(connection)) return;
    this.closeEventSource();

    const url = `${API_BASE_URL}/v1/events/stream?ticket=${encodeURIComponent(ticket)}`;
    const es = new EventSource(url);

    es.onopen = () => {
      if (!this.isCurrent(connection)) {
        es.close();
        return;
      }
      this.consecutiveFailures = 0;
      setEventStreamStatus('connected');
    };

    es.onerror = () => {
      if (!this.isCurrent(connection)) {
        es.close();
        return;
      }
      // EventSource auto-reconnect won't work because ticket is single-use.
      // Close and reconnect with a fresh ticket.
      this.closeEventSource();
      this.handleConnectionFailure(new Error('EventSource error'), connection);
    };

    es.addEventListener(SSE_EVENTS.JOB_STATUS, (e: MessageEvent) => {
      if (this.isCurrent(connection)) this.handleJobStatus(e, connection);
    });

    es.addEventListener(SSE_EVENTS.JOB_PROGRESS, (e: MessageEvent) => {
      if (this.isCurrent(connection)) this.handleJobProgress(e, connection);
    });

    es.addEventListener(SSE_EVENTS.BALANCE_UPDATED, (e: MessageEvent) => {
      if (this.isCurrent(connection)) this.handleBalanceUpdated(e, connection);
    });

    es.addEventListener(SSE_EVENTS.SYSTEM_NOTIFICATION, (e: MessageEvent) => {
      if (this.isCurrent(connection)) this.handleSystemNotification(e, connection);
    });

    es.addEventListener(SSE_EVENTS.GPU_SESSION_STATUS, (e: MessageEvent) => {
      if (this.isCurrent(connection)) this.handleGpuSessionStatus(e, connection);
    });

    es.addEventListener(SSE_EVENTS.GPU_SESSION_CREDIT_WARNING, (e: MessageEvent) => {
      if (this.isCurrent(connection)) this.handleCreditWarning(e, connection);
    });

    this.eventSource = es;
  }

  private closeEventSource(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /* ─── Event Handlers ─── */

  private handleJobStatus(e: MessageEvent, connection: ConnectionIdentity): void {
    try {
      const data = JSON.parse(e.data);
      if (!isJobStatusPayload(data)) return;
      this.processJobStatus(data, connection);
    } catch {
      // Malformed event — ignore
    }
  }

  private processJobStatus(payload: JobStatusPayload, connection: ConnectionIdentity): void {
    const { job_id, status } = payload;
    const terminal = (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);

    // 1. Update active job store (if this is the currently tracked job)
    const activeJob = get(activeJobStore);
    if (activeJob?.jobId === job_id) {
      if (terminal) {
        if (status === 'completed') {
          this.queryClient.invalidateQueries({ queryKey: jobKeys.detail(job_id) });
          generationStore.setStatus(status);
          activeJobStore.updateStatus(status);
          pushNudge.maybeShow();
        } else {
          // Failed/cancelled/moderated
          generationStore.setStatus(status);
          activeJobStore.clear();

          if (status === 'failed') {
            addToast({
              type: 'error',
              message: m.job_toast_failed({ provider: payload.provider }),
            });
          } else if (status === 'moderated') {
            addToast({ type: 'warning', message: m.job_toast_moderated() });
          }
        }
      } else {
        generationStore.setStatus(status);
        activeJobStore.updateStatus(status);
      }
    }

    // 2. Optimistically update cached job detail if present
    const detailKey = jobKeys.detail(job_id);
    const cached = this.queryClient.getQueryData(detailKey);
    if (cached && typeof cached === 'object' && 'status' in cached) {
      this.queryClient.setQueryData(detailKey, { ...cached, status });
    }

    // 3. On terminal status, invalidate relevant query lists
    if (terminal) {
      this.queryClient.invalidateQueries({ queryKey: jobKeys.all });
      this.queryClient.invalidateQueries({ queryKey: ['gallery'] });
      if (status === 'completed') {
        // Jobs started while a Library project was active are assigned after outputs exist.
        // This is deliberately best effort: project metadata must never block job completion.
        void inheritProjectForCompletedJobId(job_id)
          .then(() => {
            if (!this.isCurrent(connection)) return;
            this.queryClient.invalidateQueries({ queryKey: libraryKeys.all });
            this.queryClient.invalidateQueries({ queryKey: projectKeys.all });
          })
          .catch(() => undefined);
      }
      // Safety invalidation with small delay in case balance.updated event is lost
      setTimeout(() => {
        if (!this.isCurrent(connection)) return;
        this.queryClient.invalidateQueries({ queryKey: billingKeys.balance() });
      }, 2000);
    }
  }

  private handleJobProgress(e: MessageEvent, connection: ConnectionIdentity): void {
    try {
      const data = JSON.parse(e.data);
      if (!isJobProgressPayload(data)) return;
      this.processJobProgress(data, connection);
    } catch {
      // Malformed event — ignore
    }
  }

  private processJobProgress(payload: JobProgressPayload, connection: ConnectionIdentity): void {
    if (!this.isCurrent(connection)) return;
    const activeJob = get(activeJobStore);
    if (activeJob?.jobId === payload.job_id) {
      generationStore.setProgress(payload.progress_pct);
    }
  }

  private handleBalanceUpdated(e: MessageEvent, connection: ConnectionIdentity): void {
    try {
      const data = JSON.parse(e.data);
      if (!isBalanceUpdatedPayload(data)) return;
      this.processBalanceUpdated(data, connection);
    } catch {
      // Malformed event — ignore
    }
  }

  private processBalanceUpdated(
    payload: BalanceUpdatedPayload,
    connection: ConnectionIdentity,
  ): void {
    if (!this.isCurrent(connection)) return;
    // Optimistically update the balance cache
    this.queryClient.setQueryData(billingKeys.balance(), (old: unknown) => {
      if (old && typeof old === 'object' && 'balance' in old) {
        return { ...old, balance: payload.balance };
      }
      return { balance: payload.balance, account_id: payload.account_id };
    });

    // Invalidate transactions list so next view is fresh
    this.queryClient.invalidateQueries({ queryKey: billingKeys.transactionsRoot() });

    // Show toast for credits/refunds (not debits — those are expected during generation).
    // Unknown/future transaction types update the balance silently — no toast, no
    // reconciliation — rather than being guessed at.
    const isKnownType = (Object.values(KNOWN_TRANSACTION_TYPES) as string[]).includes(
      payload.transaction_type,
    );

    if (payload.delta > 0 && isKnownType) {
      const message =
        payload.transaction_type === KNOWN_TRANSACTION_TYPES.TOPUP
          ? m.billing_topup_credited()
          : payload.transaction_type === KNOWN_TRANSACTION_TYPES.REFUND
            ? m.balance_toast_refund({ amount: payload.delta })
            : m.balance_toast_credit({ amount: payload.delta });
      addToast({
        type: 'success',
        message,
        durationMs: 3000,
      });
      // Optimistically clear warnings — if top-up was insufficient the backend re-emits
      dismissAllCreditWarnings();
    }

    if (payload.transaction_type === KNOWN_TRANSACTION_TYPES.TOPUP) {
      this.requestPendingPaymentReconciliation(connection);
    }
  }

  private requestPendingPaymentReconciliation(connection: ConnectionIdentity): void {
    if (!this.isCurrent(connection)) return;
    if (this.reconciliationRun) {
      this.reconciliationQueued = true;
      return;
    }

    this.reconciliationRun = this.reconcilePendingPayments(connection).finally(() => {
      this.reconciliationRun = null;
      if (this.isCurrent(connection) && this.reconciliationQueued) {
        this.reconciliationQueued = false;
        this.requestPendingPaymentReconciliation(connection);
      }
    });
  }

  private async reconcilePendingPayments(connection: ConnectionIdentity): Promise<void> {
    const scope = getPendingPaymentScope();
    if (!this.isCurrent(connection) || !scope) return;

    try {
      const transactions = await fetchPendingPaymentTransactions(scope);
      if (this.isCurrent(connection)) reconcilePendingPayments(scope, transactions);
    } catch {
      // The balance event is still authoritative. A later poll/focus refresh retries matching.
    }
  }

  private handleSystemNotification(e: MessageEvent, connection: ConnectionIdentity): void {
    try {
      const data = JSON.parse(e.data);
      if (!isSystemNotificationPayload(data)) return;
      if (this.isCurrent(connection)) addNotification(data);
    } catch {
      // Malformed event — ignore
    }
  }

  private handleGpuSessionStatus(e: MessageEvent, connection: ConnectionIdentity): void {
    try {
      const data = JSON.parse(e.data);
      if (!isGpuSessionStatusPayload(data)) return;
      this.processGpuSessionStatus(data, connection);
    } catch {
      // Malformed event — ignore
    }
  }

  private processGpuSessionStatus(
    payload: GpuSessionStatusPayload,
    connection: ConnectionIdentity,
  ): void {
    if (!this.isCurrent(connection)) return;
    const { session_id, status, previous_status } = payload;

    // Patch cached session detail optimistically
    this.queryClient.setQueryData(
      sessionKeys.detail(session_id),
      (prev: Record<string, unknown> | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          status,
          tunnel_hostname: payload.tunnel_hostname ?? prev['tunnel_hostname'],
          error_message: payload.error_message ?? prev['error_message'],
        };
      },
    );

    // Invalidate list + providers so the create-page model card refreshes
    this.queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    this.queryClient.invalidateQueries({ queryKey: ['providers'] });

    // Dismiss credit warning for this session when it reaches a terminal state
    if (status === 'stopped' || status === 'failed') {
      dismissCreditWarning(session_id);
    }

    // One-shot toasts keyed on transitions only
    if (previous_status !== status) {
      if (status === 'active') {
        addToast({ type: 'success', message: m.session_toast_ready(), durationMs: 4000 });
      } else if (status === 'failed') {
        addToast({
          type: 'error',
          message: payload.error_message ?? m.session_toast_failed(),
          durationMs: 6000,
        });
      } else if (status === 'stale') {
        addToast({
          type: 'warning',
          message: payload.error_message
            ? `${m.session_toast_stale()}: ${payload.error_message}`
            : m.session_toast_stale(),
          durationMs: 6000,
        });
      } else if (status === 'stopped') {
        if (payload.reason === 'insufficient_credits') {
          addToast({
            type: 'warning',
            message: m.session_toast_stopped_no_credits(),
            durationMs: 8000,
          });
        } else {
          addToast({ type: 'success', message: m.session_toast_stopped(), durationMs: 3000 });
        }
      }
    }
  }

  private handleCreditWarning(e: MessageEvent, connection: ConnectionIdentity): void {
    try {
      const data = JSON.parse(e.data);
      if (!isGpuSessionCreditWarningPayload(data)) return;
      this.processCreditWarning(data, connection);
    } catch {
      // Malformed event — ignore
    }
  }

  private processCreditWarning(
    payload: GpuSessionCreditWarningPayload,
    connection: ConnectionIdentity,
  ): void {
    if (!this.isCurrent(connection)) return;
    upsertCreditWarning(payload);
  }

  /* ─── Reconnection Logic ─── */

  private handleConnectionFailure(error: unknown, connection: ConnectionIdentity): void {
    if (!this.isCurrent(connection)) return;
    this.closeEventSource();
    this.consecutiveFailures++;

    // Permanent fallback: SSE is not available on this backend
    if (error instanceof SSEUnavailableError) {
      setEventStreamStatus('fallback');
      return;
    }

    // Rate limited — wait and retry
    if (error instanceof SSERateLimitedError) {
      const delay = 10_000; // conservative 10s wait
      this.scheduleReconnect(delay, connection);
      return;
    }

    // Too many failures — switch to fallback with periodic SSE retry
    if (this.consecutiveFailures >= SSE_MAX_CONSECUTIVE_FAILURES) {
      setEventStreamStatus('fallback');
      this.scheduleFallbackRetry(connection);
      return;
    }

    // Exponential backoff reconnect
    const delay = Math.min(
      SSE_RECONNECT_BASE_MS * Math.pow(2, this.consecutiveFailures - 1),
      SSE_RECONNECT_MAX_MS,
    );
    setEventStreamStatus('connecting');
    this.scheduleReconnect(delay, connection);
  }

  private scheduleReconnect(delayMs: number, connection: ConnectionIdentity): void {
    this.clearTimers();
    this.reconnectTimer = setTimeout(() => {
      if (this.isCurrent(connection)) void this.connect();
    }, delayMs);
  }

  private scheduleFallbackRetry(connection: ConnectionIdentity): void {
    this.fallbackRetryTimer = setTimeout(() => {
      if (this.isCurrent(connection)) {
        this.consecutiveFailures = 0;
        void this.connect();
      }
    }, SSE_FALLBACK_RETRY_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.fallbackRetryTimer) {
      clearTimeout(this.fallbackRetryTimer);
      this.fallbackRetryTimer = null;
    }
  }
}

/* ─── Custom Error Classes ─── */
class SSEUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SSEUnavailableError';
  }
}

class SSERateLimitedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SSERateLimitedError';
  }
}
