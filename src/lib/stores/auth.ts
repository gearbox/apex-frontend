import { get, writable, derived } from 'svelte/store';
import { STORAGE_KEYS, SESSION_KEYS } from '$lib/utils/constants';
import { isBrowser } from '$lib/utils/env';
import { locale } from '$lib/stores/locale';
import { resetAppState } from '$lib/stores/resetAppState';
import { invalidateAuthOperations } from '$lib/stores/authLifecycle';

/* ─── Types ─── */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  /** Absolute expiry of the `apex_content` cookie minted alongside these tokens. */
  contentCookieExpiresAt: string;
}

/**
 * Discriminated reasons a refresh can fail with (mirrors the backend's three `/v1/auth/refresh`
 * error codes, plus a local `network` case for transient failures). Shared by the login screen
 * (B2 — picks the right message) and the media recovery ladder (B3 — skips retrying a
 * definitively revoked credential). Persisted to sessionStorage so it survives the hard
 * `window.location.href` redirect the 401 middleware uses.
 */
export type AuthFailureReason =
  'invalid_token' | 'token_reuse_detected' | 'account_inactive' | 'network';

const AUTH_FAILURE_REASONS: readonly AuthFailureReason[] = [
  'invalid_token',
  'token_reuse_detected',
  'account_inactive',
  'network',
];

function isAuthFailureReason(value: unknown): value is AuthFailureReason {
  return typeof value === 'string' && (AUTH_FAILURE_REASONS as readonly string[]).includes(value);
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  subscription_tier: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  locale?: string;
  age_verified: boolean;
  age_verified_at?: string | null;
  date_of_birth?: string | null;
}

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

/* ─── Internal State ─── */
const authStatus = writable<AuthStatus>('unknown');
const user = writable<UserProfile | null>(null);
const contentCookieExpiresAt = writable<Date | null>(null);
let accessToken: string | null = null;
/** Same-page-lifetime record of the last definitive refresh failure — see AuthFailureReason. */
let authFailureReason: AuthFailureReason | null = null;

function parseContentCookieExpiry(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ─── Derived Stores (read-only exports) ─── */
export const currentUser = { subscribe: user.subscribe };
export const currentAuthStatus = { subscribe: authStatus.subscribe };
/** The only source of truth the content-cookie keep-alive scheduler reads (see contentCookie.ts). */
export const currentContentCookieExpiresAt = { subscribe: contentCookieExpiresAt.subscribe };
export const isAuthenticated = derived(authStatus, ($s) => $s === 'authenticated');
/** True when the user has superadmin role. */
export const isSuperAdmin = derived(user, ($u) => $u?.role === 'superadmin');

/** True when the user has any admin-level role (admin OR superadmin). */
export const isAdmin = derived(user, ($u) => $u?.role === 'admin' || $u?.role === 'superadmin');

/** True when the user has completed age verification. */
export const isAgeVerified = derived(user, ($u) => $u?.age_verified ?? false);

/* ─── Token Access ─── */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Snapshot access for logout coordination while credentials are still valid. */
export function getCurrentUser(): UserProfile | null {
  return get(user);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

export function getContentCookieExpiresAt(): Date | null {
  return get(contentCookieExpiresAt);
}

/** Set by remintContentCookie() on a successful re-mint — the other place tokens are "set". */
export function setContentCookieExpiresAt(expiresAt: Date | null): void {
  contentCookieExpiresAt.set(expiresAt);
}

/** Same-page-lifetime read used by the media ladder to skip retrying a known-revoked credential (B3). */
export function getAuthFailureReason(): AuthFailureReason | null {
  return authFailureReason;
}

/**
 * Records the definitive reason the last refresh failed. Persisted to sessionStorage (not just
 * in memory) so it survives the 401 middleware's hard `window.location.href` redirect and is
 * still readable once the login screen mounts — see consumeAuthFailureReason().
 */
export function setAuthFailureReason(reason: AuthFailureReason): void {
  authFailureReason = reason;
  if (isBrowser()) {
    try {
      sessionStorage.setItem(SESSION_KEYS.AUTH_FAILURE_REASON, reason);
    } catch {
      // Best effort — worst case the login screen falls back to the silent redirect.
    }
  }
}

/** One-shot read for the login screen: clears the persisted marker so a later reload can't re-show it. */
export function consumeAuthFailureReason(): AuthFailureReason | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.AUTH_FAILURE_REASON);
    sessionStorage.removeItem(SESSION_KEYS.AUTH_FAILURE_REASON);
    return isAuthFailureReason(raw) ? raw : null;
  } catch {
    return null;
  }
}

/* ─── Actions ─── */
export function setAuth(tokens: AuthTokens, profile: UserProfile): void {
  // `login`/`register` explicitly open a new boundary before their network work begins.  This
  // guard also protects imperative callers from replacing A with B through setAuth directly.
  if (get(user)?.id && get(user)?.id !== profile.id) invalidateAuthOperations();
  accessToken = tokens.accessToken;
  if (isBrowser()) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  }
  contentCookieExpiresAt.set(parseContentCookieExpiry(tokens.contentCookieExpiresAt));
  // A fresh, successful auth outcome makes any earlier failure narrative moot.
  authFailureReason = null;
  if (isBrowser()) {
    try {
      sessionStorage.removeItem(SESSION_KEYS.AUTH_FAILURE_REASON);
    } catch {
      // Storage remains optional.
    }
  }
  user.set(profile);
  authStatus.set('authenticated');
  if (profile.locale) {
    locale.hydrate(profile.locale);
  }
}

export function updateTokens(
  tokens: Omit<AuthTokens, 'refreshToken'> & { refreshToken: string },
): void {
  accessToken = tokens.accessToken;
  if (isBrowser()) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  }
  contentCookieExpiresAt.set(parseContentCookieExpiry(tokens.contentCookieExpiresAt));
}

export function setUser(profile: UserProfile): void {
  user.set(profile);
}

/**
 * Runs on every dead-session path (explicit logout, a definitive refresh failure, an account
 * deactivation/deletion). Stays synchronous and cannot throw: resetAppState() individually
 * guards each of its own steps for the same reason. Deliberately does not touch
 * authFailureReason — that is set *before* this runs (see silentRefresh) and must survive it so
 * the login screen and media ladder can still read it afterwards.
 */
export function clearAuth(): void {
  // This must remain the first side effect: anything that still owns A's credential is aborted
  // before A's storage/store values are removed or a new session can be installed.
  invalidateAuthOperations();
  accessToken = null;
  if (isBrowser()) {
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  }
  user.set(null);
  authStatus.set('unauthenticated');
  contentCookieExpiresAt.set(null);
  resetAppState();
}

/**
 * Opens a replacing-session boundary while credentials are still available for best-effort
 * logout/push cleanup.  Login/register call this before issuing their first request.
 */
export function beginAuthTransition(): void {
  invalidateAuthOperations();
}

export function setAuthStatus(status: AuthStatus): void {
  authStatus.set(status);
}

/** Test-only: resets the in-memory + persisted failure reason between test files. */
export function __resetAuthFailureReasonForTesting(): void {
  authFailureReason = null;
  if (isBrowser()) {
    try {
      sessionStorage.removeItem(SESSION_KEYS.AUTH_FAILURE_REASON);
    } catch {
      // Storage remains optional.
    }
  }
}
