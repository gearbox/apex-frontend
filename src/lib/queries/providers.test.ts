import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { get } from 'svelte/store';
import { QueryClient, QueryObserver } from '@tanstack/svelte-query';
import { server } from '../../mocks/server';
import { ApiRequestError } from '$lib/api/errors';
import { isSSEFallback, setEventStreamStatus } from '$lib/stores/eventStream';
import { fetchProviders, providersQueryOptions } from './providers';

const BASE = 'http://localhost:8000';

describe('fetchProviders()', () => {
  it('accepts a successful empty provider catalog', async () => {
    server.use(
      http.get(`${BASE}/v1/providers`, () =>
        HttpResponse.json({ providers: [], user_context: null }),
      ),
    );

    await expect(fetchProviders()).resolves.toEqual({ providers: [], user_context: null });
  });

  it('throws on a failed provider request instead of treating it as an empty catalog', async () => {
    server.use(
      http.get(`${BASE}/v1/providers`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Provider service unavailable', status_code: 500 },
          { status: 500 },
        ),
      ),
    );

    await expect(fetchProviders()).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe('providersQueryOptions() — reactive fallback polling', () => {
  afterEach(() => {
    vi.useRealTimers();
    setEventStreamStatus('disconnected');
  });

  it('starts polling when an already-mounted observer enters fallback, and stops again on reconnect', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const provisioningCatalog = {
      providers: [
        {
          provider: 'aisha',
          models: [{ model_key: 'aisha-image', runtime: { state: 'provisioning' } }],
        },
      ],
      user_context: null,
    };
    const activeCatalog = {
      providers: [
        { provider: 'aisha', models: [{ model_key: 'aisha-image', runtime: { state: 'active' } }] },
      ],
      user_context: null,
    };
    server.use(
      http.get(`${BASE}/v1/providers`, () => {
        calls += 1;
        return HttpResponse.json(calls === 1 ? provisioningCatalog : activeCatalog);
      }),
    );
    setEventStreamStatus('connected');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // Create's actual query construction is reactive: createQuery(() =>
    // providersQueryOptions($isSSEFallback ? 8000 : false)). Svelte's real createQuery derives
    // options from that same callback and calls observer.setOptions() whenever a dependency
    // changes (see @tanstack/svelte-query's createBaseQuery.svelte.ts) — subscribing to the
    // store here reproduces that exact reactive update path on an already-mounted observer,
    // without requiring a full component render.
    const observer = new QueryObserver(
      client,
      providersQueryOptions(get(isSSEFallback) ? 8000 : false),
    );
    const unsubscribeObserver = observer.subscribe(() => {});
    const unsubscribeStore = isSSEFallback.subscribe(($fallback) => {
      observer.setOptions(providersQueryOptions($fallback ? 8000 : false));
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    expect(observer.getCurrentResult().data).toMatchObject({
      providers: [{ models: [{ runtime: { state: 'provisioning' } }] }],
    });

    // The page stays mounted; SSE degrades to fallback afterward.
    setEventStreamStatus('fallback');
    await vi.advanceTimersByTimeAsync(8000);
    expect(calls).toBe(2);
    expect(observer.getCurrentResult().data).toMatchObject({
      providers: [{ models: [{ runtime: { state: 'active' } }] }],
    });

    // SSE reconnects; fallback polling must stop without remounting.
    const callsAtReconnect = calls;
    setEventStreamStatus('connected');
    await vi.advanceTimersByTimeAsync(24_000);
    expect(calls).toBe(callsAtReconnect);

    unsubscribeStore();
    unsubscribeObserver();
  });
});
