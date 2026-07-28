import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeTokenResponse } from '../../mocks/factories/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import {
  failedRefreshHandler,
  tokenReuseDetectedRefreshHandler,
  accountInactiveRefreshHandler,
  contentCookieRemintHandler,
  failedContentCookieRemintHandler,
  rateLimitedLoginHandler,
  rateLimitWarningLoginHandler,
} from '../../mocks/handlers/auth';
import {
  login,
  logout,
  silentRefresh,
  remintContentCookie,
  initAuth,
  register,
  AuthError,
} from './auth';
import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  getCurrentUser,
  setAuth,
  getAuthFailureReason,
  consumeAuthFailureReason,
  getContentCookieExpiresAt,
  __resetAuthFailureReasonForTesting,
} from '$lib/stores/auth';
import { getQueryClient } from '$lib/queries/queryClient';
import { clearRateLimits, getRateLimitState } from '$lib/stores/rateLimit';
import { STORAGE_KEYS, SESSION_KEYS } from '$lib/utils/constants';
import {
  resetPushNotificationStateForTesting,
  storePushRegistration,
} from '$lib/services/pushNotifications';

const BASE = 'http://localhost:8000';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  clearAuth();
  __resetAuthFailureReasonForTesting();
  clearRateLimits();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('register()', () => {
  it('sends only email, password, display_name — no age fields', async () => {
    const tokenRes = makeTokenResponse();
    const profile = makeUserProfile();
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post(`${BASE}/v1/auth/register`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(tokenRes, { status: 201 });
      }),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    await register('new@example.com', 'password123', 'Jane Doe');

    expect(capturedBody).toEqual({
      email: 'new@example.com',
      password: 'password123',
      display_name: 'Jane Doe',
    });
    expect(capturedBody).not.toHaveProperty('age_confirmed');
    expect(capturedBody).not.toHaveProperty('date_of_birth');
    expect(getAccessToken()).toBe(tokenRes.access_token);
  });

  it('omits display_name when not provided', async () => {
    const tokenRes = makeTokenResponse();
    const profile = makeUserProfile();
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post(`${BASE}/v1/auth/register`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(tokenRes, { status: 201 });
      }),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    await register('new@example.com', 'password123');

    expect(capturedBody).toEqual({
      email: 'new@example.com',
      password: 'password123',
      display_name: undefined,
    });
    expect(capturedBody).not.toHaveProperty('age_confirmed');
    expect(capturedBody).not.toHaveProperty('date_of_birth');
  });

  it('failure (400 email_exists): throws AuthError with email_exists code', async () => {
    server.use(
      http.post(`${BASE}/v1/auth/register`, () =>
        HttpResponse.json(
          {
            error: 'email_exists',
            message: 'An account with this email already exists.',
            status_code: 400,
          },
          { status: 400 },
        ),
      ),
    );

    const err = await register('existing@example.com', 'password123').catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.error).toBe('email_exists');
    expect(err.status_code).toBe(400);
  });
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

  it('sets contentCookieExpiresAt from the response (C2)', async () => {
    const tokenRes = makeTokenResponse({
      content_cookie_expires_at: '2030-01-01T00:00:00.000Z',
    });
    server.use(
      http.post(`${BASE}/v1/auth/login`, () => HttpResponse.json(tokenRes)),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(makeUserProfile())),
    );

    await login('test@example.com', 'password123');

    expect(getContentCookieExpiresAt()?.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('resets app state (query cache) on a fresh login, independent of prior session teardown (A3)', async () => {
    // Seed the cache as if a previous user's data were still sitting there.
    getQueryClient().setQueryData(['library', 'previous-user'], { items: ['secret'] });

    server.use(
      http.post(`${BASE}/v1/auth/login`, () => HttpResponse.json(makeTokenResponse())),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(makeUserProfile())),
    );

    await login('next@example.com', 'password123');

    expect(getQueryClient().getQueryData(['library', 'previous-user'])).toBeUndefined();
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

    expect(result).toEqual({ ok: true });
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

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(callCount).toBe(1);
  });

  it('failure (401 invalid_token): clears auth store, reports the benign reason', async () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'revoked-token');

    server.use(failedRefreshHandler);

    const result = await silentRefresh();

    expect(result).toEqual({ ok: false, reason: 'invalid_token' });
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(getAuthFailureReason()).toBe('invalid_token');
  });

  it('failure (401 token_reuse_detected): reports the security reason and persists it for the login screen (B2/B3)', async () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'stolen-token');

    server.use(tokenReuseDetectedRefreshHandler);

    const result = await silentRefresh();

    expect(result).toEqual({ ok: false, reason: 'token_reuse_detected' });
    expect(getAccessToken()).toBeNull();
    expect(getAuthFailureReason()).toBe('token_reuse_detected');
    // Persisted to sessionStorage so it survives the 401 middleware's hard reload.
    expect(sessionStorage.getItem(SESSION_KEYS.AUTH_FAILURE_REASON)).toBe('token_reuse_detected');
    expect(consumeAuthFailureReason()).toBe('token_reuse_detected');
    // One-shot: consuming it clears the persisted marker.
    expect(sessionStorage.getItem(SESSION_KEYS.AUTH_FAILURE_REASON)).toBeNull();
  });

  it('failure (401 account_inactive): reports the deactivation reason', async () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'deactivated-token');

    server.use(accountInactiveRefreshHandler);

    const result = await silentRefresh();

    expect(result).toEqual({ ok: false, reason: 'account_inactive' });
    expect(getAuthFailureReason()).toBe('account_inactive');
  });

  it('terminal failure posts both captured credentials to purge the origin HTTP cache', async () => {
    setAuth(
      {
        accessToken: 'dead-access-token',
        refreshToken: 'dead-refresh-token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      makeUserProfile(),
    );
    const logoutRequests: Array<{ authorization: string | null; refreshToken: string }> = [];
    server.use(
      failedRefreshHandler,
      http.post(`${BASE}/v1/auth/logout`, async ({ request }) => {
        logoutRequests.push({
          authorization: request.headers.get('Authorization'),
          refreshToken: ((await request.json()) as { refresh_token: string }).refresh_token,
        });
        return HttpResponse.json({ message: 'Logged out successfully' });
      }),
    );

    await expect(silentRefresh()).resolves.toEqual({ ok: false, reason: 'invalid_token' });
    await vi.waitFor(() => expect(logoutRequests).toHaveLength(1));

    expect(logoutRequests).toEqual([
      { authorization: 'Bearer dead-access-token', refreshToken: 'dead-refresh-token' },
    ]);
    expect(getAccessToken()).toBeNull();
  });

  it('does not request a cache purge for a network refresh failure', async () => {
    let logoutRequests = 0;
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'existing-refresh-token');
    server.use(
      http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.error()),
      http.post(`${BASE}/v1/auth/logout`, () => {
        logoutRequests += 1;
        return HttpResponse.json({ message: 'Logged out successfully' });
      }),
    );

    await expect(silentRefresh()).resolves.toEqual({ ok: false, reason: 'network' });
    expect(logoutRequests).toBe(0);
  });

  it('still clears auth when the terminal cache-purge request throws', async () => {
    setAuth(
      {
        accessToken: 'dead-access-token',
        refreshToken: 'dead-refresh-token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      makeUserProfile(),
    );
    server.use(
      failedRefreshHandler,
      http.post(`${BASE}/v1/auth/logout`, () => HttpResponse.error()),
    );

    await expect(silentRefresh()).resolves.toEqual({ ok: false, reason: 'invalid_token' });

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('no refresh token: clears auth and reports invalid_token', async () => {
    const result = await silentRefresh();
    expect(result).toEqual({ ok: false, reason: 'invalid_token' });
  });

  it('network error (offline): retains refresh token, reports network, status unauthenticated', async () => {
    const { currentAuthStatus } = await import('$lib/stores/auth');
    let status: string | undefined;
    const unsub = currentAuthStatus.subscribe((s) => (status = s));

    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'existing-refresh-token');

    server.use(http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.error()));

    const result = await silentRefresh();
    unsub();

    expect(result).toEqual({ ok: false, reason: 'network' });
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('existing-refresh-token');
    expect(status).toBe('unauthenticated');
  });

  it('refresh endpoint 503: retains refresh token, reports network', async () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'existing-refresh-token');

    server.use(
      http.post(`${BASE}/v1/auth/refresh`, () =>
        HttpResponse.json(
          { error: 'service_unavailable', message: 'Try again later', status_code: 503 },
          { status: 503 },
        ),
      ),
    );

    const result = await silentRefresh();

    expect(result).toEqual({ ok: false, reason: 'network' });
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('existing-refresh-token');
  });

  it('refresh endpoint 429: retains refresh token, reports network', async () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'existing-refresh-token');

    server.use(
      http.post(`${BASE}/v1/auth/refresh`, () =>
        HttpResponse.json(
          { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
          { status: 429 },
        ),
      ),
    );

    const result = await silentRefresh();

    expect(result).toEqual({ ok: false, reason: 'network' });
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('existing-refresh-token');
  });
});

describe('remintContentCookie()', () => {
  it('200: returns the parsed expiry and stores it', async () => {
    setAuth(
      {
        accessToken: 'still-good-access-token',
        refreshToken: 'still-good-refresh-token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      makeUserProfile(),
    );
    server.use(contentCookieRemintHandler);

    const result = await remintContentCookie();

    expect(result).toMatchObject({ kind: 'ok' });
    expect(getContentCookieExpiresAt()?.getTime()).toBe(
      result.kind === 'ok' ? result.expiresAt.getTime() : undefined,
    );
  });

  it('401: returns null and never calls clearAuth()', async () => {
    setAuth(
      {
        accessToken: 'dead-access-token',
        refreshToken: 'still-good-refresh-token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      makeUserProfile(),
    );
    server.use(failedContentCookieRemintHandler);

    const result = await remintContentCookie();

    expect(result).toEqual({ kind: 'unauthorized' });
    // A failed re-mint is not evidence of a dead session — the access token must survive.
    expect(getAccessToken()).toBe('dead-access-token');
  });

  it('no access token: returns null without a network call', async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/v1/auth/content-cookie`, () => {
        called = true;
        return HttpResponse.json({ expires_at: new Date().toISOString() });
      }),
    );

    const result = await remintContentCookie();

    expect(result).toEqual({ kind: 'unauthorized' });
    expect(called).toBe(false);
  });

  it('concurrent callers share one in-flight request', async () => {
    let callCount = 0;
    setAuth(
      {
        accessToken: 'shared-access-token',
        refreshToken: 'shared-refresh-token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      makeUserProfile(),
    );
    server.use(
      http.post(`${BASE}/v1/auth/content-cookie`, () => {
        callCount++;
        return HttpResponse.json({ expires_at: new Date(Date.now() + 86_400_000).toISOString() });
      }),
    );

    const results = await Promise.all([
      remintContentCookie(),
      remintContentCookie(),
      remintContentCookie(),
    ]);

    expect(callCount).toBe(1);
    expect(results.every((r) => r.kind === 'ok')).toBe(true);
  });

  it('records a valid expiry when a sibling rotates the access token mid-flight', async () => {
    const profile = makeUserProfile();
    setAuth(
      {
        accessToken: 'initial-access-token',
        refreshToken: 'initial-refresh-token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      profile,
    );
    const response = deferred<Response>();
    const started = deferred<void>();
    const remintedExpiry = new Date(Date.now() + 86_400_000).toISOString();

    server.use(
      http.post(`${BASE}/v1/auth/content-cookie`, () => {
        started.resolve();
        return response.promise;
      }),
    );

    const remint = remintContentCookie();
    await started.promise;
    setAuth(
      {
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      profile,
    );
    response.resolve(HttpResponse.json({ expires_at: remintedExpiry }));

    await expect(remint).resolves.toMatchObject({ kind: 'ok' });
    expect(getContentCookieExpiresAt()?.toISOString()).toBe(remintedExpiry);
  });
});

describe('auth epoch isolation', () => {
  const userA = makeUserProfile({ id: 'user-a' });
  const userB = makeUserProfile({ id: 'user-b' });

  function authenticateAs(accessToken: string, refreshToken: string, profile = userA): void {
    setAuth(
      {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      profile,
    );
  }

  it('does not restore A when a deferred refresh settles after clearAuth()', async () => {
    authenticateAs('access-a', 'refresh-a');
    const response = deferred<Response>();
    const started = deferred<void>();
    server.use(
      http.post(`${BASE}/v1/auth/refresh`, async () => {
        started.resolve();
        return response.promise;
      }),
    );

    const refresh = silentRefresh();
    await started.promise;
    clearAuth();
    response.resolve(HttpResponse.json(makeTokenResponse({ access_token: 'late-access-a' })));

    await expect(refresh).resolves.toMatchObject({ ok: false });
    expect(getAccessToken()).toBeNull();
    expect(getCurrentUser()).toBeNull();
  });

  it('does not let a deferred A refresh overwrite a later B session', async () => {
    authenticateAs('access-a', 'refresh-a');
    const response = deferred<Response>();
    const started = deferred<void>();
    server.use(
      http.post(`${BASE}/v1/auth/refresh`, async () => {
        started.resolve();
        return response.promise;
      }),
    );

    const refresh = silentRefresh();
    await started.promise;
    authenticateAs('access-b', 'refresh-b', userB);
    response.resolve(HttpResponse.json(makeTokenResponse({ access_token: 'late-access-a' })));

    await expect(refresh).resolves.toMatchObject({ ok: false });
    expect(getAccessToken()).toBe('access-b');
    expect(getCurrentUser()?.id).toBe('user-b');
  });

  it('does not restore cookie expiry after a re-mint is invalidated by logout', async () => {
    authenticateAs('access-a', 'refresh-a');
    const originalExpiry = getContentCookieExpiresAt()?.getTime();
    const response = deferred<Response>();
    const started = deferred<void>();
    server.use(
      http.post(`${BASE}/v1/auth/content-cookie`, async () => {
        started.resolve();
        return response.promise;
      }),
    );

    const remint = remintContentCookie();
    await started.promise;
    clearAuth();
    response.resolve(
      HttpResponse.json({ expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
    );

    await expect(remint).resolves.toMatchObject({ kind: expect.stringMatching(/aborted|stale/) });
    expect(getContentCookieExpiresAt()).toBeNull();
    expect(originalExpiry).toBeDefined();
  });

  it('keeps B cookie expiry authoritative when A re-mint settles late', async () => {
    authenticateAs('access-a', 'refresh-a');
    const response = deferred<Response>();
    const started = deferred<void>();
    server.use(
      http.post(`${BASE}/v1/auth/content-cookie`, async () => {
        started.resolve();
        return response.promise;
      }),
    );

    const remint = remintContentCookie();
    await started.promise;
    const bExpiry = new Date(Date.now() + 3_600_000).toISOString();
    setAuth(
      {
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: bExpiry,
      },
      userB,
    );
    response.resolve(
      HttpResponse.json({ expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
    );

    await expect(remint).resolves.toMatchObject({ kind: expect.stringMatching(/aborted|stale/) });
    expect(getContentCookieExpiresAt()?.toISOString()).toBe(bExpiry);
  });

  it('does not reuse a re-mint single-flight promise across auth epochs', async () => {
    authenticateAs('access-a', 'refresh-a');
    const first = deferred<Response>();
    const second = deferred<Response>();
    let calls = 0;
    server.use(
      http.post(`${BASE}/v1/auth/content-cookie`, () => {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      }),
    );

    const remintA = remintContentCookie();
    await vi.waitFor(() => expect(calls).toBe(1));
    authenticateAs('access-b', 'refresh-b', userB);
    const remintB = remintContentCookie();
    await vi.waitFor(() => expect(calls).toBe(2));
    second.resolve(
      HttpResponse.json({ expires_at: new Date(Date.now() + 7_200_000).toISOString() }),
    );
    first.resolve(
      HttpResponse.json({ expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
    );

    await expect(remintB).resolves.toMatchObject({ kind: 'ok' });
    await expect(remintA).resolves.toMatchObject({ kind: expect.stringMatching(/aborted|stale/) });
  });

  it('treats an auth-transition abort as ignored rather than a security banner', async () => {
    authenticateAs('access-a', 'refresh-a');
    const response = deferred<Response>();
    const started = deferred<void>();
    server.use(
      http.post(`${BASE}/v1/auth/refresh`, async () => {
        started.resolve();
        return response.promise;
      }),
    );

    const refresh = silentRefresh();
    await started.promise;
    clearAuth();
    response.resolve(HttpResponse.json(makeTokenResponse()));

    await expect(refresh).resolves.toMatchObject({ ok: false, reason: 'aborted' });
    expect(getAuthFailureReason()).toBeNull();
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

  it('detaches a confirmed push registration before the access token is cleared', async () => {
    const profile = makeUserProfile({ id: 'logout-user' });
    setAuth(
      {
        accessToken: 'logout-access',
        refreshToken: 'logout-refresh',
        expiresAt: 'later',
        contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      profile,
    );
    const subscription = {
      endpoint: 'https://push.example.com/logout-order',
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    vi.stubGlobal('navigator', {
      userAgent: 'test-agent',
      platform: 'Win32',
      maxTouchPoints: 0,
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
        }),
      },
    });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'granted' });
    storePushRegistration({ version: 1, endpoint: subscription.endpoint, userId: profile.id });

    const calls: string[] = [];
    server.use(
      http.delete(`${BASE}/v1/push/subscriptions`, () => {
        calls.push(`detach:${getAccessToken()}`);
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${BASE}/v1/auth/logout`, () => {
        calls.push(`logout:${getAccessToken()}`);
        return HttpResponse.json({ message: 'Logged out successfully' });
      }),
    );

    await logout();

    expect(calls).toEqual(['detach:logout-access', 'logout:logout-access']);
    expect(getAccessToken()).toBeNull();
    resetPushNotificationStateForTesting();
    vi.unstubAllGlobals();
  });

  it('uses credentials rotated while push detachment refreshes the session', async () => {
    const profile = makeUserProfile({ id: 'logout-user' });
    const rotatedTokens = makeTokenResponse({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
    });
    setAuth(
      {
        accessToken: 'expired-access',
        refreshToken: 'original-refresh',
        expiresAt: 'later',
        contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      profile,
    );
    const subscription = {
      endpoint: 'https://push.example.com/logout-refresh',
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    resetPushNotificationStateForTesting();
    vi.stubGlobal('navigator', {
      userAgent: 'test-agent',
      platform: 'Win32',
      maxTouchPoints: 0,
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
        }),
      },
    });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'granted' });
    storePushRegistration({ version: 1, endpoint: subscription.endpoint, userId: profile.id });

    const detachAuthorizations: Array<string | null> = [];
    let refreshBody: { refresh_token: string } | undefined;
    let logoutRequest: { authorization: string | null; refreshToken: string } | undefined;
    server.use(
      http.delete(`${BASE}/v1/push/subscriptions`, ({ request }) => {
        detachAuthorizations.push(request.headers.get('Authorization'));
        return detachAuthorizations.length === 1
          ? HttpResponse.json({ error: 'expired' }, { status: 401 })
          : new HttpResponse(null, { status: 204 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, async ({ request }) => {
        refreshBody = (await request.json()) as { refresh_token: string };
        return HttpResponse.json(rotatedTokens);
      }),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
      http.post(`${BASE}/v1/auth/logout`, async ({ request }) => {
        logoutRequest = {
          authorization: request.headers.get('Authorization'),
          refreshToken: ((await request.json()) as { refresh_token: string }).refresh_token,
        };
        return HttpResponse.json({ message: 'Logged out successfully' });
      }),
    );

    try {
      await logout();

      expect(detachAuthorizations).toEqual(['Bearer expired-access', 'Bearer rotated-access']);
      expect(refreshBody).toEqual({ refresh_token: 'original-refresh' });
      expect(logoutRequest).toEqual({
        authorization: 'Bearer rotated-access',
        refreshToken: 'rotated-refresh',
      });
    } finally {
      resetPushNotificationStateForTesting();
      vi.unstubAllGlobals();
    }
  });

  it('skips the logout request when a replacement login completes during push cleanup', async () => {
    const profileA = makeUserProfile({ id: 'user-a' });
    const profileB = makeUserProfile({ id: 'user-b' });
    const bCookieExpiry = new Date(Date.now() + 7_200_000).toISOString();
    const registration = deferred<{ pushManager: { getSubscription: () => Promise<null> } }>();
    const getRegistration = vi.fn().mockReturnValue(registration.promise);
    let logoutRequests = 0;

    resetPushNotificationStateForTesting();
    vi.stubGlobal('navigator', {
      userAgent: 'test-agent',
      platform: 'Win32',
      maxTouchPoints: 0,
      serviceWorker: { getRegistration },
    });
    try {
      setAuth(
        {
          accessToken: 'access-a',
          refreshToken: 'refresh-a',
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
        profileA,
      );
      server.use(
        http.post(`${BASE}/v1/auth/logout`, () => {
          logoutRequests += 1;
          return HttpResponse.json({ message: 'Logged out successfully' });
        }),
      );

      const pendingLogout = logout();
      await vi.waitFor(() => expect(getRegistration).toHaveBeenCalledOnce());

      setAuth(
        {
          accessToken: 'access-b',
          refreshToken: 'refresh-b',
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          contentCookieExpiresAt: bCookieExpiry,
        },
        profileB,
      );
      registration.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } });
      await pendingLogout;

      expect(logoutRequests).toBe(0);
      expect(getContentCookieExpiresAt()?.toISOString()).toBe(bCookieExpiry);
    } finally {
      resetPushNotificationStateForTesting();
      vi.unstubAllGlobals();
    }
  });

  it('aborts an in-flight A logout on replacement login and preserves B cookie state', async () => {
    const profileA = makeUserProfile({ id: 'user-a' });
    const profileB = makeUserProfile({ id: 'user-b' });
    const bCookieExpiry = new Date(Date.now() + 7_200_000).toISOString();
    const response = deferred<Response>();
    const requestStarted = deferred<void>();
    let requestSignal: AbortSignal | undefined;
    let authorization: string | null = null;

    resetPushNotificationStateForTesting();
    vi.stubGlobal('navigator', {
      userAgent: 'test-agent',
      platform: 'Win32',
      maxTouchPoints: 0,
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
        }),
      },
    });
    try {
      setAuth(
        {
          accessToken: 'access-a',
          refreshToken: 'refresh-a',
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          contentCookieExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
        profileA,
      );
      server.use(
        http.post(`${BASE}/v1/auth/logout`, ({ request }) => {
          authorization = request.headers.get('Authorization');
          requestSignal = request.signal;
          requestStarted.resolve();
          return response.promise;
        }),
      );

      const pendingLogout = logout();
      await requestStarted.promise;
      expect(authorization).toBe('Bearer access-a');

      setAuth(
        {
          accessToken: 'access-b',
          refreshToken: 'refresh-b',
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          contentCookieExpiresAt: bCookieExpiry,
        },
        profileB,
      );
      expect(requestSignal?.aborted).toBe(true);
      response.resolve(HttpResponse.json({ message: 'Logged out successfully' }));
      await pendingLogout;

      expect(getAccessToken()).toBe('access-b');
      expect(getContentCookieExpiresAt()?.toISOString()).toBe(bCookieExpiry);
    } finally {
      resetPushNotificationStateForTesting();
      vi.unstubAllGlobals();
    }
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

describe('rate limiting in auth flows', () => {
  it('login: parses rate limit headers from a successful response and stores them', async () => {
    const profile = makeUserProfile();

    server.use(
      rateLimitWarningLoginHandler,
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    await login('user@example.com', 'password123');

    const state = getRateLimitState('/v1/auth/login');
    expect(state).toMatchObject({ limit: 10, remaining: 2 });
  });

  it('login: on 429, throws AuthError with status 429 and stores rate limit info', async () => {
    server.use(rateLimitedLoginHandler);

    const err = await login('user@example.com', 'password123').catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect(err.status_code).toBe(429);
    expect(err.error).toBe('rate_limit_exceeded');

    const state = getRateLimitState('/v1/auth/login');
    expect(state).toMatchObject({ remaining: 0, retryAfter: 45 });
  });
});
