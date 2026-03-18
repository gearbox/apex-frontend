import type { QueryClient } from '@tanstack/svelte-query';
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
import { jobKeys } from '$lib/queries/jobs';
import {
  SSE_EVENTS,
  isJobStatusPayload,
  isJobProgressPayload,
  isBalanceUpdatedPayload,
  isSystemNotificationPayload,
  type JobStatusPayload,
  type JobProgressPayload,
  type BalanceUpdatedPayload,
} from '$lib/api/events';
import { get } from 'svelte/store';

export interface EventStreamServiceOptions {
  queryClient: QueryClient;
}

export class EventStreamService {
  private queryClient: QueryClient;
  private eventSource: EventSource | null = null;
  private consecutiveFailures = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(options: EventStreamServiceOptions) {
    this.queryClient = options.queryClient;
  }

  /* ─── Public API ─── */

  async connect(): Promise<void> {
    if (this.disposed) return;
    this.clearTimers();
    setEventStreamStatus('connecting');

    try {
      const ticket = await this.obtainTicket();
      if (this.disposed) return;

      this.openEventSource(ticket);
    } catch (error) {
      if (this.disposed) return;
      this.handleConnectionFailure(error);
    }
  }

  disconnect(): void {
    this.clearTimers();
    this.closeEventSource();
    setEventStreamStatus('disconnected');
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
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

  private openEventSource(ticket: string): void {
    this.closeEventSource();

    const url = `${API_BASE_URL}/v1/events/stream?ticket=${encodeURIComponent(ticket)}`;
    const es = new EventSource(url);

    es.onopen = () => {
      if (this.disposed) { es.close(); return; }
      this.consecutiveFailures = 0;
      setEventStreamStatus('connected');
    };

    es.onerror = () => {
      if (this.disposed) { es.close(); return; }
      // EventSource auto-reconnect won't work because ticket is single-use.
      // Close and reconnect with a fresh ticket.
      this.closeEventSource();
      this.handleConnectionFailure(new Error('EventSource error'));
    };

    es.addEventListener(SSE_EVENTS.JOB_STATUS, (e: MessageEvent) => {
      this.handleJobStatus(e);
    });

    es.addEventListener(SSE_EVENTS.JOB_PROGRESS, (e: MessageEvent) => {
      this.handleJobProgress(e);
    });

    es.addEventListener(SSE_EVENTS.BALANCE_UPDATED, (e: MessageEvent) => {
      this.handleBalanceUpdated(e);
    });

    es.addEventListener(SSE_EVENTS.SYSTEM_NOTIFICATION, (e: MessageEvent) => {
      this.handleSystemNotification(e);
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

  private handleJobStatus(e: MessageEvent): void {
    try {
      const data = JSON.parse(e.data);
      if (!isJobStatusPayload(data)) return;
      this.processJobStatus(data);
    } catch {
      // Malformed event — ignore
    }
  }

  private processJobStatus(payload: JobStatusPayload): void {
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
        } else {
          // Failed/cancelled/moderated
          generationStore.setStatus(status);
          activeJobStore.clear();

          if (status === 'failed') {
            addToast({ type: 'error', message: `Generation failed (${payload.provider})` });
          } else if (status === 'moderated') {
            addToast({ type: 'warning', message: 'Content was moderated by the AI provider.' });
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
      // Safety invalidation with small delay in case balance.updated event is lost
      setTimeout(() => {
        this.queryClient.invalidateQueries({ queryKey: ['balance'] });
      }, 2000);
    }
  }

  private handleJobProgress(e: MessageEvent): void {
    try {
      const data = JSON.parse(e.data);
      if (!isJobProgressPayload(data)) return;
      this.processJobProgress(data);
    } catch {
      // Malformed event — ignore
    }
  }

  private processJobProgress(payload: JobProgressPayload): void {
    const activeJob = get(activeJobStore);
    if (activeJob?.jobId === payload.job_id) {
      generationStore.setProgress(payload.progress_pct);
    }
  }

  private handleBalanceUpdated(e: MessageEvent): void {
    try {
      const data = JSON.parse(e.data);
      if (!isBalanceUpdatedPayload(data)) return;
      this.processBalanceUpdated(data);
    } catch {
      // Malformed event — ignore
    }
  }

  private processBalanceUpdated(payload: BalanceUpdatedPayload): void {
    // Optimistically update the balance cache
    this.queryClient.setQueryData(['balance'], (old: unknown) => {
      if (old && typeof old === 'object' && 'balance' in old) {
        return { ...old, balance: payload.balance };
      }
      return { balance: payload.balance, account_id: payload.account_id };
    });

    // Invalidate transactions list so next view is fresh
    this.queryClient.invalidateQueries({ queryKey: ['transactions'] });

    // Show toast for credits/refunds (not debits — those are expected during generation)
    if (payload.delta > 0) {
      const label = payload.transaction_type === 'refund' ? 'Refund' : 'Credit';
      addToast({
        type: 'success',
        message: `${label}: +${payload.delta} tokens`,
        durationMs: 3000,
      });
    }
  }

  private handleSystemNotification(e: MessageEvent): void {
    try {
      const data = JSON.parse(e.data);
      if (!isSystemNotificationPayload(data)) return;
      addNotification(data);
    } catch {
      // Malformed event — ignore
    }
  }

  /* ─── Reconnection Logic ─── */

  private handleConnectionFailure(error: unknown): void {
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
      this.scheduleReconnect(delay);
      return;
    }

    // Too many failures — switch to fallback with periodic SSE retry
    if (this.consecutiveFailures >= SSE_MAX_CONSECUTIVE_FAILURES) {
      setEventStreamStatus('fallback');
      this.scheduleFallbackRetry();
      return;
    }

    // Exponential backoff reconnect
    const delay = Math.min(
      SSE_RECONNECT_BASE_MS * Math.pow(2, this.consecutiveFailures - 1),
      SSE_RECONNECT_MAX_MS,
    );
    setEventStreamStatus('connecting');
    this.scheduleReconnect(delay);
  }

  private scheduleReconnect(delayMs: number): void {
    this.clearTimers();
    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed) this.connect();
    }, delayMs);
  }

  private scheduleFallbackRetry(): void {
    this.fallbackRetryTimer = setTimeout(() => {
      if (!this.disposed) {
        this.consecutiveFailures = 0;
        this.connect();
      }
    }, SSE_FALLBACK_RETRY_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.fallbackRetryTimer) { clearTimeout(this.fallbackRetryTimer); this.fallbackRetryTimer = null; }
  }
}

/* ─── Custom Error Classes ─── */
class SSEUnavailableError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SSEUnavailableError'; }
}

class SSERateLimitedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SSERateLimitedError'; }
}
