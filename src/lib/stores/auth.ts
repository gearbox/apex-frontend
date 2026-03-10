import { writable, derived } from 'svelte/store';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { isBrowser } from '$lib/utils/env';

/* ─── Types ─── */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  subscription_tier: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

/* ─── Internal State ─── */
const authStatus = writable<AuthStatus>('unknown');
const user = writable<UserProfile | null>(null);
let accessToken: string | null = null;

/* ─── Derived Stores (read-only exports) ─── */
export const currentUser = { subscribe: user.subscribe };
export const currentAuthStatus = { subscribe: authStatus.subscribe };
export const isAuthenticated = derived(authStatus, ($s) => $s === 'authenticated');

/* ─── Token Access ─── */
export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

/* ─── Actions ─── */
export function setAuth(tokens: AuthTokens, profile: UserProfile): void {
  accessToken = tokens.accessToken;
  if (isBrowser()) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  }
  user.set(profile);
  authStatus.set('authenticated');
}

export function updateTokens(tokens: Omit<AuthTokens, 'refreshToken'> & { refreshToken: string }): void {
  accessToken = tokens.accessToken;
  if (isBrowser()) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  }
}

export function setUser(profile: UserProfile): void {
  user.set(profile);
}

export function clearAuth(): void {
  accessToken = null;
  if (isBrowser()) {
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  }
  user.set(null);
  authStatus.set('unauthenticated');
}

export function setAuthStatus(status: AuthStatus): void {
  authStatus.set(status);
}
