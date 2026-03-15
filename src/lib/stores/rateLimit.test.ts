import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { updateRateLimit, rateLimitFor, getRateLimitState, clearRateLimits } from './rateLimit';

beforeEach(() => {
  clearRateLimits();
});

describe('updateRateLimit()', () => {
  it('stores rate limit info for an endpoint key', () => {
    updateRateLimit('/v1/auth/login', { limit: 10, remaining: 7, reset: 1710345600 });

    const state = getRateLimitState('/v1/auth/login');
    expect(state).toEqual({ limit: 10, remaining: 7, reset: 1710345600 });
  });

  it('merges new values into existing entry', () => {
    updateRateLimit('/v1/auth/login', { limit: 10, remaining: 7 });
    updateRateLimit('/v1/auth/login', { remaining: 6, retryAfter: 45 });

    const state = getRateLimitState('/v1/auth/login');
    expect(state).toEqual({ limit: 10, remaining: 6, retryAfter: 45 });
  });

  it('does not clobber other endpoint entries', () => {
    updateRateLimit('/v1/auth/login', { limit: 10, remaining: 5 });
    updateRateLimit('/v1/generate', { limit: 20, remaining: 18 });

    expect(getRateLimitState('/v1/auth/login')).toMatchObject({ remaining: 5 });
    expect(getRateLimitState('/v1/generate')).toMatchObject({ remaining: 18 });
  });
});

describe('rateLimitFor()', () => {
  it('returns a derived store that reflects current state for the endpoint', () => {
    const store = rateLimitFor('/v1/auth/login');
    expect(get(store)).toBeUndefined();

    updateRateLimit('/v1/auth/login', { limit: 10, remaining: 3 });
    expect(get(store)).toMatchObject({ remaining: 3 });
  });

  it('is reactive — updates when store changes', () => {
    const store = rateLimitFor('/v1/auth/login');
    const values: (number | undefined)[] = [];

    const unsub = store.subscribe((s) => values.push(s?.remaining));
    updateRateLimit('/v1/auth/login', { remaining: 5 });
    updateRateLimit('/v1/auth/login', { remaining: 4 });
    unsub();

    expect(values).toEqual([undefined, 5, 4]);
  });

  it('does not react to changes for a different endpoint', () => {
    const store = rateLimitFor('/v1/auth/login');
    const values: unknown[] = [];
    const unsub = store.subscribe((s) => values.push(s));

    updateRateLimit('/v1/generate', { remaining: 10 });
    unsub();

    // Only the initial undefined value; the /v1/generate update must not trigger this store
    expect(values).toEqual([undefined]);
  });
});

describe('getRateLimitState()', () => {
  it('returns undefined for unknown key', () => {
    expect(getRateLimitState('/v1/unknown')).toBeUndefined();
  });

  it('returns a synchronous snapshot', () => {
    updateRateLimit('/v1/auth/login', { remaining: 1, retryAfter: 60 });
    expect(getRateLimitState('/v1/auth/login')).toMatchObject({ remaining: 1, retryAfter: 60 });
  });
});
