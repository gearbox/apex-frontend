import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { server } from '../../mocks/server';
import {
  sseTicketUnavailableHandler,
  sseTicketRateLimitedHandler,
  sseTicketServerErrorHandler,
} from '../../mocks/handlers/events';
import { EventStreamService } from './eventStream';
import { eventStreamStatus, setEventStreamStatus } from '$lib/stores/eventStream';
import { notifications, clearNotifications } from '$lib/stores/notifications';
import { activeJobStore } from '$lib/stores/jobs';
import { generationStore } from '$lib/stores/generation';
import { toasts, removeToast } from '$lib/stores/toasts';
import { sessionKeys } from '$lib/queries/sessions';
import { creditWarnings, dismissAllCreditWarnings } from '$lib/stores/creditWarnings';
import { pushNudge } from '$lib/stores/pushNudge.svelte';

/* ─── Mock EventSource ─── */

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    // Simulate async open via microtask — avoids fake-timer dependency
    Promise.resolve().then(() => {
      if (this.readyState !== 2) {
        this.readyState = 1; // OPEN
        this.onopen?.();
      }
    });
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(handler);
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  // Test helper — simulate receiving an event
  _emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    this.listeners[type]?.forEach((h) => h(event));
  }

  // Test helper — simulate error
  _error() {
    this.onerror?.();
  }
}

/* ─── Mock QueryClient ─── */

function makeMockQueryClient() {
  return {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn().mockReturnValue(null),
  };
}

/* ─── Setup ─── */

beforeEach(() => {
  vi.stubGlobal('EventSource', MockEventSource);
  MockEventSource.instances = [];
  setEventStreamStatus('disconnected');
  clearNotifications();
  activeJobStore.clear();
  generationStore.reset();
  dismissAllCreditWarnings();
  // Drain any lingering toasts from previous tests
  get(toasts).forEach((t) => removeToast(t.id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ─── Tests ─── */

describe('EventStreamService — happy path', () => {
  it('obtains ticket, opens EventSource, sets status to connected', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    // onopen fires via microtask inside MockEventSource; resolved by await
    await svc.connect();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain('mock-sse-ticket-abc123');

    let status!: string;
    eventStreamStatus.subscribe((s) => (status = s))();
    expect(status).toBe('connected');

    svc.dispose();
  });
});

describe('EventStreamService — 503 response', () => {
  it('sets status to fallback and does not retry', async () => {
    server.use(sseTicketUnavailableHandler);

    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    await svc.connect();

    let status!: string;
    eventStreamStatus.subscribe((s) => (status = s))();
    expect(status).toBe('fallback');
    // No EventSource should have been created
    expect(MockEventSource.instances).toHaveLength(0);

    svc.dispose();
  });
});

describe('EventStreamService — 429 response', () => {
  it('schedules a retry and does not enter fallback', async () => {
    server.use(sseTicketRateLimitedHandler);

    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    // connect() awaits the 429 response and schedules a 10s retry timer
    await svc.connect();

    let status!: string;
    eventStreamStatus.subscribe((s) => (status = s))();
    // 'connecting' stays set — rate limit triggers retry, not permanent fallback
    expect(status).toBe('connecting');
    // No EventSource should have been created (ticket fetch failed before EventSource)
    expect(MockEventSource.instances).toHaveLength(0);

    // Dispose cleans up the pending retry timer
    svc.dispose();
  });
});

describe('EventStreamService — max consecutive failures', () => {
  it('enters fallback after 5 consecutive ticket failures', async () => {
    // Use a 500-error handler so ticket always fails.
    // EventSource is never opened, so onopen never fires and
    // consecutiveFailures is never reset between manual connect() calls.
    server.use(sseTicketServerErrorHandler);

    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    // Call connect() 5 times directly. Each call:
    //   1. clears any pending reconnect timer (clearTimers at top of connect)
    //   2. awaits the failing ticket request
    //   3. increments consecutiveFailures
    //   4. schedules a reconnect timer (cleared by the next connect() call)
    for (let i = 0; i < 5; i++) {
      await svc.connect();
    }

    // After the 5th failure, status should be 'fallback'
    let status!: string;
    eventStreamStatus.subscribe((s) => (status = s))();
    expect(status).toBe('fallback');

    // Dispose cleans up the pending 60s fallback-retry timer
    svc.dispose();
  });
});

describe('EventStreamService — dispose()', () => {
  it('closes EventSource and does not reconnect', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    await svc.connect();

    const es = MockEventSource.instances[0];
    svc.dispose();

    expect(es.readyState).toBe(2); // CLOSED

    // Ensure connect after dispose is a no-op
    await svc.connect();
    // No new EventSource should be created
    expect(MockEventSource.instances).toHaveLength(1);
  });
});

describe('EventStreamService — job.status_changed dispatch', () => {
  it('calls invalidateQueries on terminal status', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('job.status_changed', {
      job_id: 'job-1',
      status: 'completed',
      previous_status: 'running',
      generation_type: 't2i',
      provider: 'grok',
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['jobs']) }),
    );

    svc.dispose();
  });

  it('optimistically updates cached job detail if present', async () => {
    const queryClient = makeMockQueryClient();
    queryClient.getQueryData.mockReturnValue({ id: 'job-1', status: 'running' });

    const svc = new EventStreamService({ queryClient: queryClient as never });

    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('job.status_changed', {
      job_id: 'job-1',
      status: 'completed',
      previous_status: 'running',
      generation_type: 't2i',
      provider: 'grok',
    });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      expect.arrayContaining(['jobs', 'detail', 'job-1']),
      expect.objectContaining({ status: 'completed' }),
    );

    svc.dispose();
  });

  it('evaluates the push nudge as a contextual fallback on successful generation completion', async () => {
    const maybeShow = vi.spyOn(pushNudge, 'maybeShow').mockImplementation(() => {});
    activeJobStore.setJob('job-1', 'running');
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('job.status_changed', {
      job_id: 'job-1',
      status: 'completed',
      previous_status: 'running',
      generation_type: 't2i',
      provider: 'grok',
    });

    expect(maybeShow).toHaveBeenCalledOnce();

    svc.dispose();
    maybeShow.mockRestore();
  });
});

describe('EventStreamService — balance.updated dispatch', () => {
  it('calls setQueryData for balance and invalidateQueries for transactions', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('balance.updated', {
      account_id: 'acc-1',
      balance: 500,
      delta: -5,
      transaction_type: 'debit',
    });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['billing', 'balance'],
      expect.any(Function),
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['billing', 'transactions'],
    });

    svc.dispose();
  });
});

describe('EventStreamService — system.notification dispatch', () => {
  it('adds notification to the store', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('system.notification', {
      level: 'warning',
      title: 'Maintenance',
      message: 'Scheduled maintenance tonight',
      expires_at: null,
    });

    const stored = get(notifications);
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Maintenance');

    svc.dispose();
  });
});

describe('EventStreamService — job.progress dispatch', () => {
  it('updates generationStore progress when active job matches', async () => {
    // Set up an active job
    activeJobStore.setJob('job-progress-1', 'running');
    generationStore.startJob('job-progress-1');

    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });

    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('job.progress', {
      job_id: 'job-progress-1',
      progress_pct: 42,
      generation_type: 't2i',
    });

    let progressValue!: number | null;
    generationStore.subscribe((s) => (progressValue = s.progress))();
    expect(progressValue).toBe(42);

    svc.dispose();
  });
});

describe('EventStreamService — gpu_session.status_changed dispatch', () => {
  it('patches detail cache and invalidates sessions + providers on provisioning→active', async () => {
    const queryClient = makeMockQueryClient();
    queryClient.getQueryData.mockReturnValue({
      id: 'sess_001',
      status: 'provisioning',
    });

    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('gpu_session.status_changed', {
      session_id: 'sess_001',
      status: 'active',
      previous_status: 'provisioning',
      model_type: 'aisha-image',

      tunnel_hostname: 'tunnel.example.com',
      error_message: null,
    });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      sessionKeys.detail('sess_001'),
      expect.any(Function),
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['providers'] });

    svc.dispose();
  });

  it('fires a success toast on → active transition', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('gpu_session.status_changed', {
      session_id: 'sess_003',
      status: 'active',
      previous_status: 'provisioning',
      model_type: 'aisha-image',

      tunnel_hostname: 'tunnel.example.com',
      error_message: null,
    });

    const allToasts = get(toasts);
    expect(allToasts).toHaveLength(1);
    expect(allToasts[0].type).toBe('success');

    svc.dispose();
  });

  it('fires an error toast on → failed transition', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('gpu_session.status_changed', {
      session_id: 'sess_002',
      status: 'failed',
      previous_status: 'provisioning',
      model_type: 'aisha-image',

      tunnel_hostname: null,
      error_message: 'GPU out of memory',
    });

    const allToasts = get(toasts);
    expect(allToasts).toHaveLength(1);
    expect(allToasts[0].type).toBe('error');
    expect(allToasts[0].message).toBe('GPU out of memory');

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['providers'] });

    svc.dispose();
  });

  it('drops malformed event missing previous_status', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('gpu_session.status_changed', {
      session_id: 'sess_004',
      status: 'active',
      // previous_status intentionally omitted
      model_type: 'aisha-image',

      tunnel_hostname: null,
      error_message: null,
    });

    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(get(toasts)).toHaveLength(0);

    svc.dispose();
  });
});

describe('EventStreamService — gpu_session.credit_warning dispatch', () => {
  it('upserts credit warning in store on valid payload', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('gpu_session.credit_warning', {
      session_id: 'sess_cw_001',
      level: 'warning',
      minutes_remaining: 10,
      terminate_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      balance: 50,
    });

    const map = get(creditWarnings);
    expect(map.has('sess_cw_001')).toBe(true);
    expect(map.get('sess_cw_001')?.level).toBe('warning');

    svc.dispose();
  });

  it('ignores malformed credit_warning events', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    // Missing required fields
    es._emit('gpu_session.credit_warning', { session_id: 'sess_bad' });

    expect(get(creditWarnings).size).toBe(0);

    svc.dispose();
  });

  it('dismisses warning on level=info', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    // First add a warning
    es._emit('gpu_session.credit_warning', {
      session_id: 'sess_cw_002',
      level: 'warning',
      minutes_remaining: 5,
      terminate_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      balance: 20,
    });
    expect(get(creditWarnings).has('sess_cw_002')).toBe(true);

    // Then clear it via info level
    es._emit('gpu_session.credit_warning', {
      session_id: 'sess_cw_002',
      level: 'info',
      minutes_remaining: 0,
      terminate_at: null,
      balance: 500,
    });
    expect(get(creditWarnings).has('sess_cw_002')).toBe(false);

    svc.dispose();
  });
});

describe('EventStreamService — balance.updated dismissal heuristic', () => {
  it('dismisses all credit warnings on balance.updated with delta > 0', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    // Seed a warning first
    es._emit('gpu_session.credit_warning', {
      session_id: 'sess_topup',
      level: 'critical',
      minutes_remaining: 2,
      terminate_at: new Date(Date.now() + 2 * 60_000).toISOString(),
      balance: 10,
    });
    expect(get(creditWarnings).size).toBe(1);

    // Top-up received
    es._emit('balance.updated', {
      account_id: 'acc_001',
      balance: 1000,
      delta: 950,
      transaction_type: 'credit',
    });

    expect(get(creditWarnings).size).toBe(0);

    svc.dispose();
  });

  it('does NOT dismiss warnings on balance.updated with delta <= 0', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('gpu_session.credit_warning', {
      session_id: 'sess_debit',
      level: 'warning',
      minutes_remaining: 8,
      terminate_at: new Date(Date.now() + 8 * 60_000).toISOString(),
      balance: 40,
    });

    es._emit('balance.updated', {
      account_id: 'acc_001',
      balance: 35,
      delta: -5,
      transaction_type: 'debit',
    });

    expect(get(creditWarnings).size).toBe(1);

    svc.dispose();
  });
});

describe('EventStreamService — gpu_session.status_changed dismissal on terminal', () => {
  it('dismisses credit warning when session reaches stopped status', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('gpu_session.credit_warning', {
      session_id: 'sess_stop',
      level: 'critical',
      minutes_remaining: 0,
      terminate_at: null,
      balance: -5,
    });
    expect(get(creditWarnings).has('sess_stop')).toBe(true);

    es._emit('gpu_session.status_changed', {
      session_id: 'sess_stop',
      status: 'stopped',
      previous_status: 'stopping',
      model_type: 'aisha-image',

      tunnel_hostname: null,
      error_message: null,
      reason: 'insufficient_credits',
    });

    expect(get(creditWarnings).has('sess_stop')).toBe(false);

    svc.dispose();
  });

  it('fires insufficient_credits toast on stopped with reason=insufficient_credits', async () => {
    const queryClient = makeMockQueryClient();
    const svc = new EventStreamService({ queryClient: queryClient as never });
    await svc.connect();

    const es = MockEventSource.instances[0];
    es._emit('gpu_session.status_changed', {
      session_id: 'sess_ic',
      status: 'stopped',
      previous_status: 'stopping',
      model_type: 'aisha-image',

      tunnel_hostname: null,
      error_message: null,
      reason: 'insufficient_credits',
    });

    const allToasts = get(toasts);
    expect(allToasts).toHaveLength(1);
    expect(allToasts[0].type).toBe('warning');

    svc.dispose();
  });
});
