import { API_BASE_URL } from '$lib/utils/constants';
import {
  setAuth,
  updateTokens,
  clearAuth,
  setAuthStatus,
  getRefreshToken,
  type AuthTokens,
  type UserProfile,
} from '$lib/stores/auth';
import { parseApiError, AuthError } from '$lib/api/errors';
import { parseRateLimitHeaders, endpointKey } from '$lib/api/rateLimit';
import { updateRateLimit } from '$lib/stores/rateLimit';

// Re-export so existing callers (login/register pages) don't need to change their imports
export { AuthError };

/* ─── Types matching backend responses ─── */
interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
}

/* ─── State ─── */
let refreshPromise: Promise<boolean> | null = null;

/* ─── Helper ─── */
function toTokens(res: AuthResponse): AuthTokens {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: res.expires_at,
  };
}

async function fetchJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
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
    body: JSON.stringify({ email, password }),
  });

  const tokens = toTokens(authRes);
  const profile = await fetchProfile(tokens.accessToken);
  setAuth(tokens, profile);
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<void> {
  const authRes = await fetchJson<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name: displayName }),
  });

  const tokens = toTokens(authRes);
  const profile = await fetchProfile(tokens.accessToken);
  setAuth(tokens, profile);
}

/**
 * Attempt a silent refresh using the stored refresh token.
 * Returns true if successful, false otherwise.
 * De-duplicates concurrent calls.
 */
export async function silentRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearAuth();
      return false;
    }

    try {
      const authRes = await fetchJson<AuthResponse>('/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const tokens = toTokens(authRes);
      updateTokens(tokens);

      const profile = await fetchProfile(tokens.accessToken);
      setAuth(tokens, profile);
      return true;
    } catch {
      clearAuth();
      return false;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await fetchJson('/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Best-effort; clear local state regardless.
    }
  }
  clearAuth();
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

  const success = await silentRefresh();
  if (!success) {
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
