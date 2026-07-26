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
  type AuthTokens,
  type UserProfile,
  type AuthFailureReason,
} from '$lib/stores/auth';
import { resetAppState } from '$lib/stores/resetAppState';
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
export type SilentRefreshResult = { ok: true } | { ok: false; reason: AuthFailureReason };

/* ─── State ─── */
let refreshPromise: Promise<SilentRefreshResult> | null = null;
let contentCookieRemintPromise: Promise<Date | null> | null = null;

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

/* ─── Public API ─── */

export async function login(email: string, password: string): Promise<void> {
  const authRes = await fetchJson<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const tokens = toTokens(authRes);
  const profile = await fetchProfile(tokens.accessToken);
  setAuth(tokens, profile);
  // A fresh login must not inherit a previous account's cached data on this device, regardless
  // of how (or whether) that previous session was ever logged out (A3).
  resetAppState();
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<void> {
  const authRes = await fetchJson<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ email, password, display_name: displayName }),
  });

  const tokens = toTokens(authRes);
  const profile = await fetchProfile(tokens.accessToken);
  setAuth(tokens, profile);
  resetAppState();
}

/**
 * Attempt a silent refresh using the stored refresh token. De-duplicates concurrent calls.
 * Returns a discriminated result rather than a bare boolean so callers can distinguish a benign
 * session end (`invalid_token`, `network`) from a genuine security event (`token_reuse_detected`,
 * `account_inactive`) — see AuthFailureReason.
 */
export async function silentRefresh(): Promise<SilentRefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<SilentRefreshResult> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearAuth();
      return { ok: false, reason: 'invalid_token' };
    }

    try {
      const authRes = await fetchJson<AuthResponse>('/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const tokens = toTokens(authRes);
      const profile = await fetchProfile(tokens.accessToken);
      setAuth(tokens, profile);
      return { ok: true };
    } catch (err) {
      // Definitive rejection from the refresh endpoint → session is dead; clear it.
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
      // Transient (network error, 5xx, 429): keep the refresh token so the next
      // launch/retry can restore the session. Report failure without destroying state.
      setAuthStatus('unauthenticated');
      setAuthFailureReason('network');
      return { ok: false, reason: 'network' };
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * Re-mints the `apex_content` cookie for the caller's Bearer token, without a full token
 * refresh. Returns the new expiry on success, `null` on any failure. Never calls clearAuth() — a
 * failed re-mint (e.g. the access token happened to expire moments earlier) is not evidence of a
 * dead session; callers fall back to silentRefresh() for that (see MediaImage's ladder, C3).
 * De-duplicates concurrent callers — e.g. a grid of thumbnails failing at once — behind one
 * shared in-flight request, mirroring silentRefresh's refreshPromise.
 */
export async function remintContentCookie(): Promise<Date | null> {
  if (contentCookieRemintPromise) return contentCookieRemintPromise;

  contentCookieRemintPromise = (async (): Promise<Date | null> => {
    const token = getAccessToken();
    if (!token) return null;

    const devHeaders: Record<string, string> = {};
    if (import.meta.env.DEV) {
      devHeaders['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
    }

    try {
      const res = await fetch(`${API_BASE_URL}/v1/auth/content-cookie`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}`, ...devHeaders },
      });
      if (!res.ok) return null;

      const body = (await res.json()) as ContentCookieResponse;
      const expiresAt = new Date(body.expires_at);
      if (Number.isNaN(expiresAt.getTime())) return null;

      setContentCookieExpiresAt(expiresAt);
      return expiresAt;
    } catch {
      return null;
    }
  })();

  try {
    return await contentCookieRemintPromise;
  } finally {
    contentCookieRemintPromise = null;
  }
}

export async function logout(): Promise<void> {
  await detachCurrentUserPush();
  const refreshToken = getRefreshToken();
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
  clearAuth();
}

/**
 * Kept behind a dynamic import to avoid a module-init cycle with apiClient's auth middleware.
 * This is deliberately best effort: an explicit logout must still complete if cleanup cannot.
 */
export async function detachCurrentUserPush(): Promise<void> {
  const userId = getCurrentUser()?.id;
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

async function fetchProfile(token: string): Promise<UserProfile> {
  return fetchJson<UserProfile>('/v1/users/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}
