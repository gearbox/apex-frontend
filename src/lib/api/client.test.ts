import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeTokenResponse } from '../../mocks/factories/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { setAuth, clearAuth, getAccessToken } from '$lib/stores/auth';
import { STORAGE_KEYS } from '$lib/utils/constants';

const BASE = 'http://localhost:8000';

// Import apiClient after mocks are set up
let apiClient: (typeof import('./client'))['default'];

beforeEach(async () => {
  clearAuth();
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
