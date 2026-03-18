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

    expect(queryClient.setQueryData).toHaveBeenCalledWith(['balance'], expect.any(Function));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['transactions'] });

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
