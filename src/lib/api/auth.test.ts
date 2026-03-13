import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeTokenResponse } from '../../mocks/factories/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { failedRefreshHandler } from '../../mocks/handlers/auth';
import { login, logout, silentRefresh, initAuth, AuthError } from './auth';
import { clearAuth, getAccessToken, getRefreshToken } from '$lib/stores/auth';
import { STORAGE_KEYS } from '$lib/utils/constants';

const BASE = 'http://localhost:8000';

beforeEach(() => {
  clearAuth();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('login()', () => {
  it('success: calls /v1/auth/login and /v1/users/me, sets auth store', async () => {
    const tokenRes = makeTokenResponse();
    const profile = makeUserProfile();

    server.use(
      http.post(`${BASE}/v1/auth/login`, () => HttpResponse.json(tokenRes)),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    await login('test@example.com', 'password123');

    expect(getAccessToken()).toBe(tokenRes.access_token);
    expect(getRefreshToken()).toBe(tokenRes.refresh_token);
  });

  it('failure (401): throws AuthError with correct error code and message', async () => {
    server.use(
      http.post(`${BASE}/v1/auth/login`, () =>
        HttpResponse.json(
          { error: 'invalid_credentials', message: 'Invalid email or password', status_code: 401 },
          { status: 401 },
        ),
      ),
    );

    const err = await login('bad@example.com', 'wrongpassword').catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.error).toBe('invalid_credentials');
    expect(err.message).toBe('Invalid email or password');
    expect(err.status_code).toBe(401);
  });
});

describe('silentRefresh()', () => {
  it('success: updates tokens in store', async () => {
    const newTokens = makeTokenResponse({ access_token: 'refreshed-token' });
    const profile = makeUserProfile();

    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'existing-refresh-token');

    server.use(
      http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.json(newTokens)),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    const result = await silentRefresh();

    expect(result).toBe(true);
    expect(getAccessToken()).toBe('refreshed-token');
  });

  it('concurrent calls: only one HTTP request is made', async () => {
    let callCount = 0;
    const profile = makeUserProfile();

    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'valid-refresh-token');

    server.use(
      http.post(`${BASE}/v1/auth/refresh`, () => {
        callCount++;
        return HttpResponse.json(makeTokenResponse());
      }),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    const results = await Promise.all([silentRefresh(), silentRefresh(), silentRefresh()]);

    expect(results).toEqual([true, true, true]);
    expect(callCount).toBe(1);
  });

  it('failure (401): clears auth store and returns false', async () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'revoked-token');

    server.use(failedRefreshHandler);

    const result = await silentRefresh();

    expect(result).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
  });

  it('no refresh token: clears auth and returns false', async () => {
    const result = await silentRefresh();
    expect(result).toBe(false);
  });
});

describe('logout()', () => {
  it('calls /v1/auth/logout and clears store', async () => {
    let logoutCalled = false;

    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'mock-refresh-token');

    server.use(
      http.post(`${BASE}/v1/auth/logout`, () => {
        logoutCalled = true;
        return HttpResponse.json({ message: 'Logged out successfully' });
      }),
    );

    await logout();

    expect(logoutCalled).toBe(true);
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
  });
});

describe('initAuth()', () => {
  it('no refresh token: sets status to unauthenticated', async () => {
    const { currentAuthStatus } = await import('$lib/stores/auth');
    let status: string | undefined;
    const unsub = currentAuthStatus.subscribe((s) => (status = s));

    await initAuth();
    unsub();

    expect(status).toBe('unauthenticated');
  });

  it('valid refresh token: performs silent refresh and sets status to authenticated', async () => {
    const { currentAuthStatus } = await import('$lib/stores/auth');
    const profile = makeUserProfile();

    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'valid-refresh-token');

    server.use(
      http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.json(makeTokenResponse())),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    let status: string | undefined;
    const unsub = currentAuthStatus.subscribe((s) => (status = s));

    await initAuth();
    unsub();

    expect(status).toBe('authenticated');
  });
});
