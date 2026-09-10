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
  isGpuDeploymentStatusPayload,
  isOperationResponse,
  isGpuSessionCreditWarningPayload,
  type JobStatusPayload,
  type JobProgressPayload,
  type BalanceUpdatedPayload,
  type GpuSessionStatusPayload,
  type GpuDeploymentStatusPayload,
  type GpuSessionCreditWarningPayload,
} from '$lib/api/events';
import {
  upsertCreditWarning,
  dismissCreditWarning,
  dismissAllCreditWarnings,
} from '$lib/stores/creditWarnings';
import { sessionDetailQueryOptions, sessionKeys } from '$lib/queries/sessions';
import {
  providerKeys,
  providersQueryOptions,
  type ProvidersResponse,
} from '$lib/queries/providers';
import { operationKeys, upsertOperation } from '$lib/queries/operations';
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

interface SessionReconciliationState {
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  pending: boolean;
  generation: number;
}

const GPU_RECONCILIATION_DEBOUNCE_MS = 250;

export class EventStreamService {
  private queryClient: QueryClient;
  private eventSource: EventSource | null = null;
  private consecutiveFailures = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private reconciliationRun: Promise<void> | null = null;
  private reconciliationQueued = false;
  private readonly gpuReconciliations = new Map<string, SessionReconciliationState>();
  private sessionListReconciliationTimer: ReturnType<typeof setTimeout> | null = null;
  private providerReconciliationTimer: ReturnType<typeof setTimeout> | null = null;
  private providerReconciliationInFlight = false;
  private providerReconciliationPending = false;
  private providerReconciliationGeneration = 0;
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
    this.clearGpuReconciliations();
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
    this.clearGpuReconciliations();
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
      this.reconcileKnownGpuSessions(connection);
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

    es.addEventListener(SSE_EVENTS.GPU_SESSION_DEPLOYMENT_STATUS, (e: MessageEvent) => {
      if (this.isCurrent(connection)) this.handleGpuDeploymentStatus(e, connection);
    });

    es.addEventListener(SSE_EVENTS.GPU_SESSION_OPERATION_UPDATED, (e: MessageEvent) => {
      if (this.isCurrent(connection)) this.handleGpuOperationUpdated(e, connection);
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

    // Session scalar fields and model runtime are independent, unversioned REST snapshots.
    // This event only schedules their reconciliation; it must not overwrite cached scalars.
    this.requestGpuReconciliation(session_id, connection);

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

  private handleGpuDeploymentStatus(e: MessageEvent, connection: ConnectionIdentity): void {
    try {
      const data = JSON.parse(e.data);
      if (!isGpuDeploymentStatusPayload(data)) return;
      this.processGpuDeploymentStatus(data, connection);
    } catch {
      // Malformed event — ignore
    }
  }

  private processGpuDeploymentStatus(
    payload: GpuDeploymentStatusPayload,
    connection: ConnectionIdentity,
  ): void {
    if (!this.isCurrent(connection)) return;
    // Deliberately do not inspect deployment status, phase, or progress here. The event is
    // an invalidation signal; operation_updated owns incremental operation telemetry.
    this.requestGpuReconciliation(payload.session_id, connection);
  }

  private handleGpuOperationUpdated(e: MessageEvent, connection: ConnectionIdentity): void {
    try {
      const data = JSON.parse(e.data);
      if (!isOperationResponse(data) || !this.isCurrent(connection)) return;
      // Must happen before association lookup. deployment_id is informational and may be null.
      upsertOperation(this.queryClient, data);
    } catch {
      // Malformed event — ignore
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

  /* ─── GPU REST reconciliation ─── */

  /** Schedules one trailing-edge reconciliation per affected session. */
  private requestGpuReconciliation(
    sessionId: string,
    connection: ConnectionIdentity,
    options: { refreshProviders?: boolean; refreshList?: boolean } = {},
  ): void {
    if (!this.isCurrent(connection)) return;
    const { refreshProviders = true, refreshList = true } = options;
    const state = this.gpuReconciliations.get(sessionId) ?? {
      timer: null,
      inFlight: false,
      pending: false,
      generation: 0,
    };
    this.gpuReconciliations.set(sessionId, state);
    state.generation += 1;

    // Abort the exact active query as soon as a newer event arrives. Its query function receives
    // TanStack's signal, and TanStack will not commit an aborted generation's result.
    if (state.inFlight) {
      void this.queryClient.cancelQueries({
        queryKey: sessionKeys.detail(sessionId),
        exact: true,
      });
    }

    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = null;
      if (!this.isCurrent(connection)) return;
      if (state.inFlight) {
        state.pending = true;
        return;
      }
      void this.runGpuReconciliation(sessionId, state, connection, state.generation);
    }, GPU_RECONCILIATION_DEBOUNCE_MS);

    if (refreshList) this.requestSessionListReconciliation(connection);
    // The catalog is shared, so it gets one coalesced refresh even if several sessions change.
    if (refreshProviders) this.requestProviderReconciliation(connection);
  }

  /** The sessions list is a separate projection; it never writes a session-detail cache key. */
  private requestSessionListReconciliation(connection: ConnectionIdentity): void {
    if (!this.isCurrent(connection)) return;
    if (this.sessionListReconciliationTimer) clearTimeout(this.sessionListReconciliationTimer);
    this.sessionListReconciliationTimer = setTimeout(() => {
      this.sessionListReconciliationTimer = null;
      if (!this.isCurrent(connection)) return;
      void this.queryClient.invalidateQueries({
        queryKey: sessionKeys.list(false),
        exact: true,
      });
    }, GPU_RECONCILIATION_DEBOUNCE_MS);
  }

  private async runGpuReconciliation(
    sessionId: string,
    state: SessionReconciliationState,
    connection: ConnectionIdentity,
    requestGeneration: number,
  ): Promise<void> {
    if (!this.isCurrent(connection) || state.inFlight) return;
    state.inFlight = true;

    try {
      const queryKey = sessionKeys.detail(sessionId);
      // There is exactly one owner for this cache key: the TanStack query below. Mark it stale
      // without active-refetching, abort any pre-existing observer fetch, then perform the one
      // guarded reconciliation fetch. A later event cancels this exact query before it can commit.
      void this.queryClient.cancelQueries({ queryKey, exact: true });
      void this.queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
      await this.queryClient.fetchQuery(
        sessionDetailQueryOptions(this.queryClient, sessionId, { enabled: true }),
      );
    } catch {
      // A subsequent event, focus refresh, or reconnect can retry. Do not surface SSE noise.
    } finally {
      state.inFlight = false;
      if (this.isCurrent(connection)) {
        if (state.pending && state.timer === null) {
          state.pending = false;
          void this.runGpuReconciliation(sessionId, state, connection, state.generation);
        } else if (state.generation !== requestGeneration && state.timer === null) {
          void this.runGpuReconciliation(sessionId, state, connection, state.generation);
        }
      }
    }
  }

  private requestProviderReconciliation(connection: ConnectionIdentity): void {
    if (!this.isCurrent(connection)) return;
    this.providerReconciliationGeneration += 1;
    if (this.providerReconciliationInFlight) {
      void this.queryClient.cancelQueries({ queryKey: providerKeys.catalog(), exact: true });
    }
    if (this.providerReconciliationTimer) clearTimeout(this.providerReconciliationTimer);
    this.providerReconciliationTimer = setTimeout(() => {
      this.providerReconciliationTimer = null;
      if (!this.isCurrent(connection)) return;
      if (this.providerReconciliationInFlight) {
        this.providerReconciliationPending = true;
        return;
      }
      void this.runProviderReconciliation(connection, this.providerReconciliationGeneration);
    }, GPU_RECONCILIATION_DEBOUNCE_MS);
  }

  private async runProviderReconciliation(
    connection: ConnectionIdentity,
    requestGeneration: number,
  ): Promise<void> {
    if (!this.isCurrent(connection) || this.providerReconciliationInFlight) return;
    this.providerReconciliationInFlight = true;

    try {
      const queryKey = providerKeys.catalog();
      // As with session detail, reconciliation owns this exact cache key through TanStack. An
      // invalidation only marks stale; it must never start an uncontrolled active-observer fetch.
      void this.queryClient.cancelQueries({ queryKey, exact: true });
      void this.queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
      const providers = await this.queryClient.fetchQuery(providersQueryOptions());
      if (
        this.isCurrent(connection) &&
        this.providerReconciliationGeneration === requestGeneration
      ) {
        this.hydrateDiscoveredRuntimeSessions(providers, connection);
      }
    } catch {
      // Leave the prior catalog visible; a later invalidation/focus refresh retries.
    } finally {
      this.providerReconciliationInFlight = false;
      if (this.isCurrent(connection)) {
        if (this.providerReconciliationPending && this.providerReconciliationTimer === null) {
          this.providerReconciliationPending = false;
          void this.runProviderReconciliation(connection, this.providerReconciliationGeneration);
        } else if (
          this.providerReconciliationGeneration !== requestGeneration &&
          this.providerReconciliationTimer === null
        ) {
          void this.runProviderReconciliation(connection, this.providerReconciliationGeneration);
        }
      }
    }
  }

  /** Hydrates runtime sessions discovered in a fresh provider snapshot without starting a loop. */
  private hydrateDiscoveredRuntimeSessions(
    providers: ProvidersResponse,
    connection: ConnectionIdentity,
  ): void {
    for (const provider of providers.providers) {
      for (const model of provider.models) {
        const runtime = model.runtime;
        const sessionId = runtime?.session_id;
        if (!sessionId) continue;

        const reconciliation = this.gpuReconciliations.get(sessionId);
        const alreadyScheduled = Boolean(reconciliation?.timer || reconciliation?.inFlight);
        const detailMissing =
          this.queryClient.getQueryData(sessionKeys.detail(sessionId)) === undefined;
        const operationMissing =
          runtime.operation_id !== null &&
          this.queryClient.getQueryData(operationKeys.detail(runtime.operation_id)) === undefined;
        const needsDetail = !alreadyScheduled && (detailMissing || operationMissing);

        if (needsDetail) {
          this.requestGpuReconciliation(sessionId, connection, {
            refreshProviders: false,
            refreshList: false,
          });
        }
      }
    }
  }

  /** Reconnects are lossy: seed reconciliation from already-cached runtime/session IDs. */
  private reconcileKnownGpuSessions(connection: ConnectionIdentity): void {
    const sessionIds = new Set<string>();
    const providers = this.queryClient.getQueryData<ProvidersResponse>(providerKeys.catalog());
    for (const provider of providers?.providers ?? []) {
      for (const model of provider.models) {
        if (model.runtime?.session_id) sessionIds.add(model.runtime.session_id);
      }
    }

    for (const query of this.queryClient.getQueryCache().getAll()) {
      if (query.queryKey[0] !== sessionKeys.all[0]) continue;
      // An empty string is never a valid session ID — reject it defensively even if a caller
      // ever regresses to encoding "no session" that way again.
      if (
        query.queryKey[1] === 'detail' &&
        typeof query.queryKey[2] === 'string' &&
        query.queryKey[2].length > 0
      ) {
        sessionIds.add(query.queryKey[2]);
      }
      if (Array.isArray(query.state.data)) {
        for (const item of query.state.data) {
          if (isSessionLike(item)) sessionIds.add(item.id);
        }
      }
    }

    for (const sessionId of sessionIds) this.requestGpuReconciliation(sessionId, connection);
    // A connected stream also refreshes runtime even when no current session is cached.
    this.requestProviderReconciliation(connection);
  }

  private clearGpuReconciliations(): void {
    for (const [sessionId, state] of this.gpuReconciliations) {
      if (state.timer) clearTimeout(state.timer);
      if (state.inFlight) {
        void this.queryClient.cancelQueries({
          queryKey: sessionKeys.detail(sessionId),
          exact: true,
        });
      }
    }
    this.gpuReconciliations.clear();
    if (this.sessionListReconciliationTimer) clearTimeout(this.sessionListReconciliationTimer);
    this.sessionListReconciliationTimer = null;
    if (this.providerReconciliationTimer) clearTimeout(this.providerReconciliationTimer);
    this.providerReconciliationTimer = null;
    if (this.providerReconciliationInFlight) {
      void this.queryClient.cancelQueries({ queryKey: providerKeys.catalog(), exact: true });
    }
    this.providerReconciliationInFlight = false;
    this.providerReconciliationPending = false;
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

function isSessionLike(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string'
  );
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
