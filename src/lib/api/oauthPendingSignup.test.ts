import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_KEYS } from '$lib/utils/constants';
import * as pendingSignup from './oauthPendingSignup';

describe('OAuth pending signup storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips a valid tab-scoped record and clears it', () => {
    const pending = { ticket: 'opaque-ticket', returnTo: '/app/gallery', savedAt: Date.now() };
    pendingSignup.save(pending);
    expect(pendingSignup.load()).toEqual(pending);
    pendingSignup.clear();
    expect(pendingSignup.load()).toBeNull();
  });

  it('drops malformed and expired records', () => {
    sessionStorage.setItem(SESSION_KEYS.OAUTH_PENDING_SIGNUP, '{not-json');
    expect(pendingSignup.load()).toBeNull();

    sessionStorage.setItem(
      SESSION_KEYS.OAUTH_PENDING_SIGNUP,
      JSON.stringify({ ticket: 'opaque-ticket', returnTo: null, savedAt: Date.now() - 900_001 }),
    );
    expect(pendingSignup.load()).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.OAUTH_PENDING_SIGNUP)).toBeNull();
  });

  it('does not trust a modified storage return path', () => {
    sessionStorage.setItem(
      SESSION_KEYS.OAUTH_PENDING_SIGNUP,
      JSON.stringify({ ticket: 'opaque-ticket', returnTo: '//evil.example', savedAt: Date.now() }),
    );
    expect(pendingSignup.load()).toEqual({
      ticket: 'opaque-ticket',
      returnTo: null,
      savedAt: expect.any(Number),
    });
  });
});
