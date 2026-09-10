import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { setEventStreamStatus } from '$lib/stores/eventStream';
import { upsertOperation } from '$lib/queries/operations';
import type { components } from '$lib/api/types';
import OperationProgressQueryHost from './testing/OperationProgressQueryHost.svelte';

type OperationResponse = components['schemas']['OperationResponse'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeOperation(overrides: Partial<OperationResponse> = {}): OperationResponse {
  return {
    id: 'op_001',
    session_id: 'sess_001',
    deployment_id: null,
    kind: 'bundle_provision',
    status: 'running',
    phase: null,
    revision: 1,
    target: null,
    progress: null,
    message: null,
    error: null,
    started_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z',
    finished_at: null,
    ...overrides,
  };
}

function withProgress(pct: number): OperationResponse['progress'] {
  return { progress_pct: pct, work: null, items: null, rate: null, eta_seconds: null };
}

afterEach(() => {
  cleanup();
  server.resetHandlers();
  setEventStreamStatus('disconnected');
});

describe('OperationProgress — SSE healthy vs. fallback operation polling', () => {
  it('fetches nothing while SSE is healthy, polls bounded in fallback, never regresses on a stale REST revision, and stops at terminal', async () => {
    let requestCount = 0;
    let currentResponse = makeOperation({ revision: 2, progress: withProgress(60) });
    server.use(
      http.get(`${BASE}/v1/sessions/sess_001/operations/op_001`, () => {
        requestCount += 1;
        return HttpResponse.json(currentResponse);
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Simulates the SSE-delivered state already sitting in the canonical operation cache.
    upsertOperation(queryClient, makeOperation({ revision: 1, progress: withProgress(30) }));
    setEventStreamStatus('connected');

    render(OperationProgressQueryHost, {
      props: { queryClient, sessionId: 'sess_001', operationId: 'op_001' },
    });
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('30');

    // Healthy SSE: the fallback query is disabled outright, so this holds structurally, not by
    // timing luck — but a short real wait still proves no request sneaks through.
    await sleep(400);
    expect(requestCount).toBe(0);

    // Enter fallback: bounded polling starts, and a newer REST revision advances the UI.
    setEventStreamStatus('fallback');
    await waitFor(
      () => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60'),
      { timeout: 3000 },
    );
    expect(requestCount).toBeGreaterThanOrEqual(1);

    // The next poll tick returns an older revision than what's cached — must not regress.
    currentResponse = makeOperation({ revision: 1, progress: withProgress(10) });
    await sleep(3200);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60');

    // Operation becomes terminal — the UI advances, then polling stops.
    currentResponse = makeOperation({
      revision: 3,
      status: 'succeeded',
      progress: withProgress(100),
    });
    await waitFor(
      () => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100'),
      { timeout: 3200 },
    );
    const countAtTerminal = requestCount;
    await sleep(3200);
    expect(requestCount).toBe(countAtTerminal);

    // Reconnect: normal SSE-driven behavior resumes, and a terminal operation stays unpolled.
    setEventStreamStatus('connected');
    await sleep(400);
    expect(requestCount).toBe(countAtTerminal);
  }, 20_000);
});
