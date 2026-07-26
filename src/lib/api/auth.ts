import { API_BASE_URL } from '$lib/utils/constants';
import {
  setAuth,
  clearAuth,
  getCurrentUser,
  setAuthStatus,
  getRefreshToken,
  getAccessToken,
  setAuthFailureReason,
  setContentCookieExpiresAt,
  beginAuthTransition,
  type AuthTokens,
  type UserProfile,
  type AuthFailureReason,
} from '$lib/stores/auth';
import { resetAppState } from '$lib/stores/resetAppState';
import {
  beginAuthOperation,
  finishAuthOperation,
  getAuthEpoch,
  isAuthEpochCurrent,
  isAuthOperationCurrent,
  type AuthOperation,
} from '$lib/stores/authLifecycle';
import { parseApiError, AuthError } from '$lib/api/errors';
import { parseRateLimitHeaders, endpointKey } from '$lib/api/rateLimit';
import { updateRateLimit } from '$lib/stores/rateLimit';

// Re-export so existing callers (login/register pages) don't need to change their imports
export { AuthError };
export type { AuthFailureReason };

/* ─── Types matching backend responses ─── */
interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  content_cookie_expires_at: string;
}

interface ContentCookieResponse {
  expires_at: string;
}

/** Discriminated result — see AuthFailureReason for what each reason means to callers. */
export type SilentRefreshResult =
  | { ok: true }
  | { ok: false; reason: AuthFailureReason | 'stale' | 'aborted' };

/** A cookie re-mint is intentionally more precise than a nullable expiry. */
export type ContentCookieRemintResult =
  | { kind: 'ok'; expiresAt: Date }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterMs?: number }
  | { kind: 'transient' }
  | { kind: 'aborted' }
  | { kind: 'stale' };

/** Replacing-login work is deliberately ignored by the form that started it. */
export class AuthOperationCancelledError extends Error {
  constructor() {
    super('Authentication operation was superseded');
    this.name = 'AuthOperationCancelledError';
  }
}

/* ─── State ─── */
let refreshFlight:
  | { epoch: number; refreshToken: string; promise: Promise<SilentRefreshResult> }
  | undefined;
let contentCookieRemintFlight:
  | { epoch: number; accessToken: string; promise: Promise<ContentCookieRemintResult> }
  | undefined;

/* ─── Helper ─── */
function toTokens(res: AuthResponse): AuthTokens {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: res.expires_at,
    contentCookieExpiresAt: res.content_cookie_expires_at,
  };
}

/** Backend refresh error codes we don't recognize yet default to the benign, silent case. */
function mapRefreshErrorToReason(code: string): AuthFailureReason {
  if (code === 'token_reuse_detected') return 'token_reuse_detected';
  if (code === 'account_inactive') return 'account_inactive';
  return 'invalid_token';
}

async function fetchJson<T>(path: string, init: RequestInit): Promise<T> {
  const devHeaders: Record<string, string> = {};
  if (import.meta.env.DEV) {
    devHeaders['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...devHeaders, ...init.headers },
  });

  // Parse and store rate limit headers regardless of response status
  const rlHeaders = parseRateLimitHeaders(res.headers);
  if (Object.keys(rlHeaders).length > 0) {
    updateRateLimit(endpointKey(path), rlHeaders);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AuthError(parseApiError(body, res.status));
  }
  return res.json() as Promise<T>;
}

function wasAborted(error: unknown, operation: AuthOperation): boolean {
  return (
    operation.signal.aborted ||
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function isRefreshCurrent(operation: AuthOperation, refreshToken: string): boolean {
  return isAuthOperationCurrent(operation) && getRefreshToken() === refreshToken;
}

function isAccessTokenCurrent(operation: AuthOperation, accessToken: string): boolean {
  return isAuthOperationCurrent(operation) && getAccessToken() === accessToken;
}

function cancelledFreshAuth(operation: AuthOperation): never {
  if (!isAuthOperationCurrent(operation)) throw new AuthOperationCancelledError();
  throw new Error('Unreachable auth operation state');
}

async function completeFreshAuth(
  path: '/v1/auth/login' | '/v1/auth/register',
  body: Record<string, unknown>,
): Promise<void> {
  // A user may submit a new login/register form while a previous one is still resolving.  The
  // transition invalidation happens before the request so the older response cannot install A.
  beginAuthTransition();
  const operation = beginAuthOperation();
  try {
    const authRes = await fetchJson<AuthResponse>(path, {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(body),
      signal: operation.signal,
    });
    if (!isAuthOperationCurrent(operation)) cancelledFreshAuth(operation);

    const tokens = toTokens(authRes);
    const profile = await fetchProfile(tokens.accessToken, operation.signal);
    if (!isAuthOperationCurrent(operation)) cancelledFreshAuth(operation);

    setAuth(tokens, profile);
    // A fresh login must not inherit a previous account's cached data on this device, regardless
    // of how (or whether) that previous session was ever logged out.
    resetAppState();
  } catch (error) {
    if (wasAborted(error, operation) || !isAuthOperationCurrent(operation)) {
      throw new AuthOperationCancelledError();
    }
    throw error;
  } finally {
    finishAuthOperation(operation);
  }
}

/* ─── Public API ─── */

export async function login(email: string, password: string): Promise<void> {
  await completeFreshAuth('/v1/auth/login', { email, password });
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<void> {
  await completeFreshAuth('/v1/auth/register', {
    email,
    password,
    display_name: displayName,
  });
}

/**
 * Attempt a silent refresh using the stored refresh token. De-duplicates concurrent calls.
 * Returns a discriminated result rather than a bare boolean so callers can distinguish a benign
 * session end (`invalid_token`, `network`) from a genuine security event (`token_reuse_detected`,
 * `account_inactive`) — see AuthFailureReason.
 */
export async function silentRefresh(): Promise<SilentRefreshResult> {
  const refreshToken = getRefreshToken();
  const epoch = getAuthEpoch();
  if (!refreshToken) {
    // This is only terminal for the session that observed it.  A concurrent fresh login has
    // moved the epoch and must not be cleared by this caller.
    if (isAuthEpochCurrent(epoch)) clearAuth();
    return { ok: false, reason: 'invalid_token' };
  }

  if (refreshFlight?.epoch === epoch && refreshFlight.refreshToken === refreshToken) {
    return refreshFlight.promise;
  }

  const operation = beginAuthOperation();
  const flight = {
    epoch: operation.epoch,
    refreshToken,
    promise: (async (): Promise<SilentRefreshResult> => {
      try {
        const authRes = await fetchJson<AuthResponse>('/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ refresh_token: refreshToken }),
          signal: operation.signal,
        });
        if (!isRefreshCurrent(operation, refreshToken)) return { ok: false, reason: 'stale' };

        const tokens = toTokens(authRes);
        const profile = await fetchProfile(tokens.accessToken, operation.signal);
        if (!isRefreshCurrent(operation, refreshToken)) return { ok: false, reason: 'stale' };

        setAuth(tokens, profile);
        return { ok: true };
      } catch (err) {
        if (!isRefreshCurrent(operation, refreshToken)) {
          return { ok: false, reason: wasAborted(err, operation) ? 'aborted' : 'stale' };
        }
        // Definitive rejection from the refresh endpoint → session is dead; clear it.  The
        // current-session check above is intentionally before the banner/clear side effects.
        if (
          err instanceof AuthError &&
          err.status_code >= 400 &&
          err.status_code < 500 &&
          err.status_code !== 429
        ) {
          const reason = mapRefreshErrorToReason(err.error);
          setAuthFailureReason(reason);
          clearAuth();
          return { ok: false, reason };
        }
        // A temporary outage must not turn an already authenticated user into an unauthenticated
        // one.  The content-cookie scheduler retries these failures with bounded backoff.
        setAuthFailureReason('network');
        return { ok: false, reason: 'network' };
      } finally {
        finishAuthOperation(operation);
      }
    })(),
  };
  refreshFlight = flight;
  try {
    return await flight.promise;
  } finally {
    if (refreshFlight === flight) refreshFlight = undefined;
  }
}

/**
 * Re-mints the `apex_content` cookie for the caller's Bearer token, without a full token
 * refresh. It returns a discriminated outcome so callers can distinguish an authorization failure
 * from a temporary outage. It never calls clearAuth() — a failed re-mint is not evidence of a
 * dead session; only an explicit `unauthorized` outcome may fall back to silentRefresh().
 * De-duplicates concurrent callers — e.g. a grid of thumbnails failing at once — behind one
 * shared epoch-aware in-flight request, mirroring silentRefresh's refresh flight.
 */
export async function remintContentCookie(): Promise<ContentCookieRemintResult> {
  const accessToken = getAccessToken();
  const epoch = getAuthEpoch();
  if (!accessToken) return { kind: 'unauthorized' };

  if (
    contentCookieRemintFlight?.epoch === epoch &&
    contentCookieRemintFlight.accessToken === accessToken
  ) {
    return contentCookieRemintFlight.promise;
  }

  const operation = beginAuthOperation();
  const flight = {
    epoch: operation.epoch,
    accessToken,
    promise: (async (): Promise<ContentCookieRemintResult> => {
      const devHeaders: Record<string, string> = {};
      if (import.meta.env.DEV) {
        devHeaders['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
      }

      try {
        const res = await fetch(`${API_BASE_URL}/v1/auth/content-cookie`, {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: `Bearer ${accessToken}`, ...devHeaders },
          signal: operation.signal,
        });
        if (!isAccessTokenCurrent(operation, accessToken)) return { kind: 'stale' };

        if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' };
        if (res.status === 429) {
          const retryAfter = parseRateLimitHeaders(res.headers).retryAfter;
          return {
            kind: 'rate_limited',
            ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter * 1000 }),
          };
        }
        if (!res.ok) return { kind: 'transient' };

        const body = (await res.json()) as ContentCookieResponse;
        if (!isAccessTokenCurrent(operation, accessToken)) return { kind: 'stale' };
        const expiresAt = new Date(body.expires_at);
        if (Number.isNaN(expiresAt.getTime())) return { kind: 'transient' };

        setContentCookieExpiresAt(expiresAt);
        return { kind: 'ok', expiresAt };
      } catch (error) {
        if (!isAccessTokenCurrent(operation, accessToken)) {
          return { kind: wasAborted(error, operation) ? 'aborted' : 'stale' };
        }
        return { kind: 'transient' };
      } finally {
        finishAuthOperation(operation);
      }
    })(),
  };
  contentCookieRemintFlight = flight;
  try {
    return await flight.promise;
  } finally {
    if (contentCookieRemintFlight === flight) contentCookieRemintFlight = undefined;
  }
}

export async function logout(): Promise<void> {
  const userId = getCurrentUser()?.id;
  const refreshToken = getRefreshToken();
  // Local async work dies before the slower push/logout best-effort operations begin.
  beginAuthTransition();
  const logoutEpoch = getAuthEpoch();
  await detachCurrentUserPush(userId);
  if (refreshToken) {
    try {
      await fetchJson('/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Best-effort; clear local state regardless.
    }
  }
  // A new login may have completed while best-effort cleanup was in flight.  Never clear it.
  if (isAuthEpochCurrent(logoutEpoch)) clearAuth();
}

/**
 * Kept behind a dynamic import to avoid a module-init cycle with apiClient's auth middleware.
 * This is deliberately best effort: an explicit logout must still complete if cleanup cannot.
 */
export async function detachCurrentUserPush(userId = getCurrentUser()?.id): Promise<void> {
  if (!userId) return;

  try {
    const { detachPushOnLogout } = await import('$lib/services/pushNotifications');
    await detachPushOnLogout(userId);
  } catch {
    console.warn('[auth] push cleanup failed', { stage: 'logout' });
  }
}

export async function forgotPassword(email: string): Promise<void> {
  await fetchJson('/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await fetchJson('/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await fetchJson('/v1/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/**
 * Try to restore a session on app load.
 * Checks for a refresh token and attempts silent refresh.
 */
export async function initAuth(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    setAuthStatus('unauthenticated');
    return;
  }

  const result = await silentRefresh();
  if (!result.ok) {
    setAuthStatus('unauthenticated');
  }
}

/* ─── Internal ─── */

async function fetchProfile(token: string, signal?: AbortSignal): Promise<UserProfile> {
  return fetchJson<UserProfile>('/v1/users/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
}
