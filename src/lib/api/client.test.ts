import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeTokenResponse } from '../../mocks/factories/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { setAuth, clearAuth, getAccessToken } from '$lib/stores/auth';
import { silentRefresh } from '$lib/api/auth';
import { clearRateLimits, getRateLimitState } from '$lib/stores/rateLimit';
import { __getAuthOperationCountForTesting } from '$lib/stores/authLifecycle';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { ROUTES } from '$lib/utils/routes';

const BASE = 'http://localhost:8000';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function tokens(accessToken: string, refreshToken: string) {
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

// Import apiClient after mocks are set up
let apiClient: (typeof import('./client'))['default'];
let StaleSessionError: (typeof import('./client'))['StaleSessionError'];

beforeEach(async () => {
  clearAuth();
  clearRateLimits();
  localStorage.clear();
  const client = await import('./client');
  apiClient = client.default;
  StaleSessionError = client.StaleSessionError;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth middleware', () => {
  it('attaches Authorization header when access token exists', async () => {
    const tokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
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
      value: {
        ...window.location,
        set href(v: string) {
          hrefSetter(v);
        },
      },
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

    await expect(apiClient.GET('/v1/users/me')).rejects.toBeInstanceOf(StaleSessionError);

    expect(hrefSetter).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
    expect(getAccessToken()).toBeNull();
  });

  it('on 401 with token_reuse_detected: persists the reason for the login screen before redirecting (B2)', async () => {
    const { consumeAuthFailureReason } = await import('$lib/stores/auth');
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'stolen-refresh-token');

    Object.defineProperty(window, 'location', {
      value: { ...window.location, set href(_v: string) {} },
      writable: true,
    });

    server.use(
      http.get(`${BASE}/v1/users/me`, () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
      http.post(`${BASE}/v1/auth/refresh`, () =>
        HttpResponse.json(
          {
            error: 'token_reuse_detected',
            message: 'All sessions have been invalidated',
            status_code: 401,
          },
          { status: 401 },
        ),
      ),
    );

    await expect(apiClient.GET('/v1/users/me')).rejects.toBeInstanceOf(StaleSessionError);

    expect(consumeAuthFailureReason()).toBe('token_reuse_detected');
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
    setAuth(tokens('original-access-token', 'refresh-token'), makeUserProfile());
    let callCount = 0;
    const authHeaders: Array<string | null> = [];

    server.use(
      http.get(`${BASE}/v1/billing/balance`, ({ request }) => {
        callCount++;
        authHeaders.push(request.headers.get('Authorization'));
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
    expect(authHeaders).toEqual(['Bearer original-access-token', 'Bearer original-access-token']);
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

describe('epoch-bound middleware retries', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not send a delayed 429 retry after logout', async () => {
    vi.useFakeTimers();
    setAuth(tokens('access-a', 'refresh-a'), makeUserProfile({ id: 'user-a' }));
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/billing/balance`, () => {
        calls += 1;
        return HttpResponse.json(
          { error: 'rate_limit_exceeded' },
          { status: 429, headers: { 'Retry-After': '1' } },
        );
      }),
    );

    const request = apiClient.GET('/v1/billing/balance');
    await vi.waitFor(() => expect(calls).toBe(1));
    clearAuth();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toMatchObject({ response: { status: 429 } });
    expect(calls).toBe(1);
  });

  it('does not replay an A 429 request after B replaces the session', async () => {
    vi.useFakeTimers();
    setAuth(tokens('access-a', 'refresh-a'), makeUserProfile({ id: 'user-a' }));
    let calls = 0;
    server.use(
      http.get(`${BASE}/v1/billing/balance`, () => {
        calls += 1;
        return HttpResponse.json(
          { error: 'rate_limit_exceeded' },
          { status: 429, headers: { 'Retry-After': '1' } },
        );
      }),
    );

    const request = apiClient.GET('/v1/billing/balance');
    await vi.waitFor(() => expect(calls).toBe(1));
    setAuth(tokens('access-b', 'refresh-b'), makeUserProfile({ id: 'user-b' }));
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toMatchObject({ response: { status: 429 } });
    expect(calls).toBe(1);
  });

  it('does not replay an A 401 request when refresh is superseded by B', async () => {
    setAuth(tokens('access-a', 'refresh-a'), makeUserProfile({ id: 'user-a' }));
    const refreshResponse = deferred<Response>();
    const refreshStarted = deferred<void>();
    let balanceCalls = 0;
    server.use(
      http.get(`${BASE}/v1/billing/balance`, () => {
        balanceCalls += 1;
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, async () => {
        refreshStarted.resolve();
        return refreshResponse.promise;
      }),
    );

    const request = apiClient.GET('/v1/billing/balance');
    await refreshStarted.promise;
    setAuth(tokens('access-b', 'refresh-b'), makeUserProfile({ id: 'user-b' }));
    refreshResponse.resolve(
      HttpResponse.json(makeTokenResponse({ access_token: 'late-access-a' })),
    );

    await expect(request).rejects.toBeInstanceOf(StaleSessionError);
    expect(balanceCalls).toBe(1);
    expect(getAccessToken()).toBe('access-b');
  });

  it('retries a trailing 401 with a sibling-refreshed token', async () => {
    setAuth(tokens('expired-access', 'refresh-a'), makeUserProfile({ id: 'user-a' }));
    const refreshResponse = deferred<Response>();
    const refreshStarted = deferred<void>();
    const second401Started = deferred<void>();
    const second401 = deferred<Response>();
    const authHeaders: Array<string | null> = [];
    let initialRequests = 0;
    let refreshCalls = 0;

    server.use(
      http.get(`${BASE}/v1/billing/balance`, ({ request }) => {
        const authorization = request.headers.get('Authorization');
        authHeaders.push(authorization);
        if (authorization === 'Bearer expired-access') {
          initialRequests += 1;
          if (initialRequests === 2) {
            second401Started.resolve();
            return second401.promise;
          }
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ account_id: 'acc_001', account_type: 'personal', balance: 500 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        refreshStarted.resolve();
        return refreshResponse.promise;
      }),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(makeUserProfile({ id: 'user-a' }))),
    );

    const first = apiClient.GET('/v1/billing/balance');
    await refreshStarted.promise;
    const second = apiClient.GET('/v1/billing/balance');
    await second401Started.promise;

    refreshResponse.resolve(
      HttpResponse.json(makeTokenResponse({ access_token: 'refreshed-access' })),
    );
    await vi.waitFor(() => expect(getAccessToken()).toBe('refreshed-access'));
    second401.resolve(HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    await expect(first).resolves.toMatchObject({ response: { status: 200 } });
    await expect(second).resolves.toMatchObject({ response: { status: 200 } });
    expect(refreshCalls).toBe(1);
    expect(authHeaders).toEqual([
      'Bearer expired-access',
      'Bearer expired-access',
      'Bearer refreshed-access',
      'Bearer refreshed-access',
    ]);
  });

  it('joins an in-flight sibling refresh before retrying a 401', async () => {
    setAuth(tokens('expired-access', 'refresh-a'), makeUserProfile({ id: 'user-a' }));
    const refreshResponse = deferred<Response>();
    const refreshStarted = deferred<void>();
    let initialRequests = 0;
    let refreshCalls = 0;

    server.use(
      http.get(`${BASE}/v1/billing/balance`, ({ request }) => {
        if (request.headers.get('Authorization') === 'Bearer expired-access') {
          initialRequests += 1;
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ account_id: 'acc_001', account_type: 'personal', balance: 500 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        refreshStarted.resolve();
        return refreshResponse.promise;
      }),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(makeUserProfile({ id: 'user-a' }))),
    );

    const first = apiClient.GET('/v1/billing/balance');
    await refreshStarted.promise;
    const second = apiClient.GET('/v1/billing/balance');
    await vi.waitFor(() => expect(initialRequests).toBe(2));

    refreshResponse.resolve(
      HttpResponse.json(makeTokenResponse({ access_token: 'refreshed-access' })),
    );

    await expect(first).resolves.toMatchObject({ response: { status: 200 } });
    await expect(second).resolves.toMatchObject({ response: { status: 200 } });
    expect(refreshCalls).toBe(1);
  });

  it('retries a delayed 429 with a sibling-refreshed token', async () => {
    vi.useFakeTimers();
    setAuth(tokens('original-access', 'refresh-a'), makeUserProfile({ id: 'user-a' }));
    const authHeaders: Array<string | null> = [];
    let calls = 0;

    server.use(
      http.get(`${BASE}/v1/billing/balance`, ({ request }) => {
        calls += 1;
        authHeaders.push(request.headers.get('Authorization'));
        if (calls === 1) {
          return HttpResponse.json(
            { error: 'rate_limit_exceeded' },
            { status: 429, headers: { 'Retry-After': '1' } },
          );
        }
        return HttpResponse.json({ account_id: 'acc_001', account_type: 'personal', balance: 500 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () =>
        HttpResponse.json(makeTokenResponse({ access_token: 'refreshed-access' })),
      ),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(makeUserProfile({ id: 'user-a' }))),
    );

    const request = apiClient.GET('/v1/billing/balance');
    await vi.waitFor(() => expect(calls).toBe(1));
    await expect(silentRefresh()).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toMatchObject({ response: { status: 200 } });
    expect(authHeaders).toEqual(['Bearer original-access', 'Bearer refreshed-access']);
  });

  it('rejects a response delivered after its auth operation was invalidated', async () => {
    setAuth(tokens('access-a', 'refresh-a'), makeUserProfile({ id: 'user-a' }));
    const started = deferred<Request>();
    const response = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) => {
        started.resolve(request);
        // Intentionally ignore abort to model a response already in flight when logout occurs.
        return response.promise;
      }),
    );

    const pending = apiClient.GET('/v1/users/me');
    const dispatched = await started.promise;
    clearAuth();

    expect(dispatched.signal.aborted).toBe(true);
    response.resolve(HttpResponse.json(makeUserProfile({ id: 'user-a' })));

    await expect(pending).rejects.toBeInstanceOf(StaleSessionError);
  });

  it('releases an auth operation when fetch rejects before onResponse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(apiClient.GET('/v1/billing/balance')).rejects.toThrow('offline');

    expect(__getAuthOperationCountForTesting()).toBe(0);
  });
});

describe('body-safe retries (C1)', () => {
  it('POST with JSON body: on 429 with Retry-After: 0, retries with intact body and preserved Idempotency-Key', async () => {
    let callCount = 0;
    const capturedBodies: unknown[] = [];
    const capturedIdempotencyKeys: (string | null)[] = [];

    server.use(
      http.post(`${BASE}/v1/billing/topup/stripe`, async ({ request }) => {
        callCount++;
        capturedBodies.push(await request.json());
        capturedIdempotencyKeys.push(request.headers.get('Idempotency-Key'));
        if (callCount === 1) {
          return HttpResponse.json(
            { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
            { status: 429, headers: { 'Retry-After': '0' } },
          );
        }
        return HttpResponse.json({ checkout_url: 'https://checkout.example.com/session' });
      }),
    );

    const { response, data } = await apiClient.POST('/v1/billing/topup/stripe', {
      body: { amount_usd: 100 },
      params: { header: { 'Idempotency-Key': 'idem-key-123' } },
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
    expect(capturedBodies).toEqual([{ amount_usd: 100 }, { amount_usd: 100 }]);
    expect(capturedIdempotencyKeys).toEqual(['idem-key-123', 'idem-key-123']);
    expect(data).toMatchObject({ checkout_url: expect.any(String) });
  });

  it('POST with JSON body: on 401, refreshes and retries with new token and intact body', async () => {
    const newToken = makeTokenResponse({ access_token: 'new-access-token' });
    const profile = makeUserProfile();

    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'valid-refresh-token');

    let callCount = 0;
    const capturedBodies: unknown[] = [];
    let lastAuthHeader: string | null = null;

    server.use(
      http.post(`${BASE}/v1/billing/topup/stripe`, async ({ request }) => {
        callCount++;
        capturedBodies.push(await request.json());
        lastAuthHeader = request.headers.get('Authorization');
        if (callCount === 1) {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ checkout_url: 'https://checkout.example.com/session' });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.json(newToken)),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    const { response } = await apiClient.POST('/v1/billing/topup/stripe', {
      body: { amount_usd: 100 },
      params: { header: { 'Idempotency-Key': 'idem-key-456' } },
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
    expect(capturedBodies).toEqual([{ amount_usd: 100 }, { amount_usd: 100 }]);
    expect(lastAuthHeader).toBe('Bearer new-access-token');
  });

  it('preserves a FormData upload body while binding the auth-operation signal', async () => {
    const formData = new FormData();
    formData.append('data', new Blob(['private upload']), 'private.txt');
    let received: Request | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        received = request;
        return HttpResponse.json({ id: 'upload_001' }, { status: 201 });
      }),
    );

    await apiClient.POST('/v1/storage/upload', { body: formData as never });

    // jsdom's Request.formData() hangs for File bodies, so assert the reconstructed request has
    // retained the multipart stream for fetch to transmit rather than trying to parse it here.
    expect(received?.headers.get('Content-Type')).toContain('multipart/form-data');
    expect(received?.body).not.toBeNull();
    expect(received?.bodyUsed).toBe(false);
  });

  it('on 429 with Retry-After beyond the 30s cap: does not retry, returns the 429 immediately', async () => {
    let callCount = 0;

    server.use(
      http.get(`${BASE}/v1/billing/balance`, () => {
        callCount++;
        return HttpResponse.json(
          { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
          { status: 429, headers: { 'Retry-After': '3600' } },
        );
      }),
    );

    const start = Date.now();
    const { response } = await apiClient.GET('/v1/billing/balance');
    const elapsed = Date.now() - start;

    expect(response.status).toBe(429);
    expect(callCount).toBe(1);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('402 insufficient balance — toast throttle', () => {
  let addToastSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    // Reset the module so lastInsufficientBalanceToastAt starts at 0
    vi.resetModules();
    const toastsModule = await import('$lib/stores/toasts');
    addToastSpy = vi.spyOn(toastsModule, 'addToast');
    apiClient = (await import('./client')).default;

    server.use(
      http.get(`${BASE}/v1/billing/balance`, () =>
        HttpResponse.json({ error: 'payment_required' }, { status: 402 }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires a single toast for two rapid 402s within the throttle window', async () => {
    await apiClient.GET('/v1/billing/balance');
    await apiClient.GET('/v1/billing/balance');
    expect(addToastSpy).toHaveBeenCalledTimes(1);
    expect(addToastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        action: expect.objectContaining({ href: ROUTES.billingTopUp }),
      }),
    );
  });

  it('fires a second toast after the throttle window elapses', async () => {
    await apiClient.GET('/v1/billing/balance');
    vi.advanceTimersByTime(6001);
    await apiClient.GET('/v1/billing/balance');
    expect(addToastSpy).toHaveBeenCalledTimes(2);
  });
});
