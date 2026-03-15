import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeTokenResponse } from '../../mocks/factories/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { setAuth, clearAuth, getAccessToken } from '$lib/stores/auth';
import { clearRateLimits, getRateLimitState } from '$lib/stores/rateLimit';
import { STORAGE_KEYS } from '$lib/utils/constants';

const BASE = 'http://localhost:8000';

// Import apiClient after mocks are set up
let apiClient: (typeof import('./client'))['default'];

beforeEach(async () => {
  clearAuth();
  clearRateLimits();
  localStorage.clear();
  apiClient = (await import('./client')).default;
});

describe('auth middleware', () => {
  it('attaches Authorization header when access token exists', async () => {
    const tokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
    setAuth(tokens, makeUserProfile());

    let capturedAuth: string | null = null;
    server.use(
      http.get(`${BASE}/v1/users/me`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json(makeUserProfile());
      }),
    );

    await apiClient.GET('/v1/users/me');

    expect(capturedAuth).toBe('Bearer test-access-token');
  });

  it('on 401: calls silentRefresh and retries with new token', async () => {
    // Use /v1/billing/balance to avoid conflating with the /v1/users/me call
    // that happens inside silentRefresh (which fetches the user profile).
    const newToken = makeTokenResponse({ access_token: 'new-access-token' });
    const profile = makeUserProfile();

    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'valid-refresh-token');

    let balanceRequestCount = 0;
    let lastAuthHeader: string | null = null;

    server.use(
      http.get(`${BASE}/v1/billing/balance`, ({ request }) => {
        balanceRequestCount++;
        lastAuthHeader = request.headers.get('Authorization');
        if (balanceRequestCount === 1) {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ account_id: 'acc_001', account_type: 'personal', balance: 500 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.json(newToken)),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    const { response } = await apiClient.GET('/v1/billing/balance');

    expect(response.status).toBe(200);
    expect(balanceRequestCount).toBe(2);
    expect(lastAuthHeader).toBe('Bearer new-access-token');
  });

  it('on 401 and refresh fails: redirects to /login', async () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'revoked-refresh-token');

    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, set href(v: string) { hrefSetter(v); } },
      writable: true,
    });

    server.use(
      http.get(`${BASE}/v1/users/me`, () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
      http.post(`${BASE}/v1/auth/refresh`, () =>
        HttpResponse.json({ error: 'token_revoked' }, { status: 401 }),
      ),
    );

    await apiClient.GET('/v1/users/me');

    expect(hrefSetter).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
    expect(getAccessToken()).toBeNull();
  });
});

describe('rate limit middleware', () => {
  it('parses X-RateLimit-* headers and updates store on any response', async () => {
    server.use(
      http.get(`${BASE}/v1/billing/balance`, () =>
        HttpResponse.json(
          { account_id: 'acc_001', account_type: 'personal', balance: 500 },
          {
            headers: {
              'X-RateLimit-Limit': '100',
              'X-RateLimit-Remaining': '87',
              'X-RateLimit-Reset': '1710345600',
            },
          },
        ),
      ),
    );

    await apiClient.GET('/v1/billing/balance');

    const state = getRateLimitState('/v1/billing/balance');
    expect(state).toMatchObject({ limit: 100, remaining: 87, reset: 1710345600 });
  });

  it('on 429 with Retry-After: 0 — retries immediately and returns the successful response', async () => {
    let callCount = 0;

    server.use(
      http.get(`${BASE}/v1/billing/balance`, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(
            { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': '10',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': '1710345600',
                'Retry-After': '0',
              },
            },
          );
        }
        return HttpResponse.json(
          { account_id: 'acc_001', account_type: 'personal', balance: 500 },
          {
            headers: {
              'X-RateLimit-Limit': '10',
              'X-RateLimit-Remaining': '1',
              'X-RateLimit-Reset': '1710345600',
            },
          },
        );
      }),
    );

    const { response } = await apiClient.GET('/v1/billing/balance');

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
    // After the retry the updated remaining count should be reflected in the store
    expect(getRateLimitState('/v1/billing/balance')).toMatchObject({ remaining: 1 });
  });

  it('on 429: updates store with retryAfter from Retry-After header', async () => {
    server.use(
      http.get(`${BASE}/v1/billing/balance`, () =>
        HttpResponse.json(
          { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': '10',
              'X-RateLimit-Remaining': '0',
              'Retry-After': '0',
            },
          },
        ),
      ),
    );

    // Exhaust all retries (MAX_RATE_LIMIT_RETRIES = 3, so 4 total calls)
    await apiClient.GET('/v1/billing/balance');

    const state = getRateLimitState('/v1/billing/balance');
    expect(state).toMatchObject({ remaining: 0, retryAfter: 0 });
  });

  it('gives up after MAX_RATE_LIMIT_RETRIES and returns the 429 response', async () => {
    let callCount = 0;

    server.use(
      http.get(`${BASE}/v1/billing/balance`, () => {
        callCount++;
        return HttpResponse.json(
          { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
          { status: 429, headers: { 'Retry-After': '0' } },
        );
      }),
    );

    const { response } = await apiClient.GET('/v1/billing/balance');

    expect(response.status).toBe(429);
    // 1 original + 3 retries = 4 calls
    expect(callCount).toBe(4);
  });
});
