import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setAuth,
  clearAuth,
  updateTokens,
  setAuthStatus,
  getAccessToken,
  getRefreshToken,
  currentUser,
  isAuthenticated,
  isAdmin,
  currentAuthStatus,
} from './auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { STORAGE_KEYS } from '$lib/utils/constants';

const mockTokens = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
};

function getStoreValue<T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T {
  let value!: T;
  const unsub = store.subscribe((v) => (value = v));
  unsub();
  return value;
}

beforeEach(() => {
  clearAuth();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('setAuth()', () => {
  it('stores access token in memory and refresh token in localStorage', () => {
    const profile = makeUserProfile();

    setAuth(mockTokens, profile);

    expect(getAccessToken()).toBe('test-access-token');
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('test-refresh-token');
  });

  it('updates user store and sets status to authenticated', () => {
    const profile = makeUserProfile({ email: 'new@example.com' });

    setAuth(mockTokens, profile);

    expect(getStoreValue(currentUser)).toMatchObject({ email: 'new@example.com' });
    expect(getStoreValue(isAuthenticated)).toBe(true);
    expect(getStoreValue(currentAuthStatus)).toBe('authenticated');
  });
});

describe('clearAuth()', () => {
  it('clears all state and localStorage', () => {
    setAuth(mockTokens, makeUserProfile());

    clearAuth();

    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(getStoreValue(currentUser)).toBeNull();
    expect(getStoreValue(isAuthenticated)).toBe(false);
    expect(getStoreValue(currentAuthStatus)).toBe('unauthenticated');
  });
});

describe('updateTokens()', () => {
  it('updates tokens but preserves user profile', () => {
    const profile = makeUserProfile();
    setAuth(mockTokens, profile);

    updateTokens({
      accessToken: 'updated-access-token',
      refreshToken: 'updated-refresh-token',
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
    });

    expect(getAccessToken()).toBe('updated-access-token');
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('updated-refresh-token');
    // Profile should be preserved
    expect(getStoreValue(currentUser)).toMatchObject({ email: profile.email });
  });
});

describe('setAuthStatus()', () => {
  it('transitions status correctly', () => {
    expect(getStoreValue(currentAuthStatus)).toBe('unauthenticated');

    setAuthStatus('unknown');
    expect(getStoreValue(currentAuthStatus)).toBe('unknown');

    setAuthStatus('authenticated');
    expect(getStoreValue(currentAuthStatus)).toBe('authenticated');

    setAuthStatus('unauthenticated');
    expect(getStoreValue(currentAuthStatus)).toBe('unauthenticated');
  });
});

describe('getRefreshToken()', () => {
  it('returns null when no token stored', () => {
    expect(getRefreshToken()).toBeNull();
  });

  it('returns stored refresh token from localStorage', () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'stored-refresh-token');
    expect(getRefreshToken()).toBe('stored-refresh-token');
  });
});

describe('isAdmin', () => {
  it('returns false when user is null', () => {
    expect(getStoreValue(isAdmin)).toBe(false);
  });

  it('returns false for a regular user', () => {
    setAuth(mockTokens, makeUserProfile({ role: 'user' }));
    expect(getStoreValue(isAdmin)).toBe(false);
  });

  it('returns true for an admin user', () => {
    setAuth(mockTokens, makeUserProfile({ role: 'admin' }));
    expect(getStoreValue(isAdmin)).toBe(true);
  });

  it('returns false after clearAuth', () => {
    setAuth(mockTokens, makeUserProfile({ role: 'admin' }));
    clearAuth();
    expect(getStoreValue(isAdmin)).toBe(false);
  });
});
