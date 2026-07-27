import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetAppState } from './resetAppState';
import { clearAuth, setAuth } from './auth';
import { getQueryClient } from '$lib/queries/queryClient';
import { activeProject } from './activeProject.svelte';
import { activeJobStore } from './jobs';
import { generationStore } from './generation';
import { creditWarnings, upsertCreditWarning } from './creditWarnings';
import { toasts, addToast } from './toasts';
import { notifications, addNotification } from './notifications';
import { eventStreamStatus, setEventStreamStatus } from './eventStream';
import { makeUserProfile } from '../../mocks/factories/user';
import { LEGACY_CONTENT_MEDIA_CACHE_NAME } from '$lib/utils/cacheNames';

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

describe('clearAuth() -> resetAppState()', () => {
  it("the A-part regression test: clears the query cache seeded with a previous account's data", () => {
    getQueryClient().setQueryData(['library', 'user-a'], { items: ['user-a-secret-asset'] });
    expect(getQueryClient().getQueryData(['library', 'user-a'])).toBeDefined();

    clearAuth();

    expect(getQueryClient().getQueryData(['library', 'user-a'])).toBeUndefined();
  });

  it('clearAuth() stays synchronous — the cache is already gone with no await', () => {
    getQueryClient().setQueryData(['library', 'user-a'], { items: ['x'] });

    const returnValue = clearAuth();

    expect(returnValue).toBeUndefined();
    expect(getQueryClient().getQueryData(['library', 'user-a'])).toBeUndefined();
  });
});

describe('resetAppState()', () => {
  it('clears every store it owns', () => {
    getQueryClient().setQueryData(['probe'], 42);
    activeProject.set('project-1');
    activeProject.trackJob('job-1', 'project-1');
    activeJobStore.setJob('job-1', 'pending');
    generationStore.setPrompt('a very personal prompt');
    upsertCreditWarning({
      session_id: 'sess-1',
      level: 'warning',
      minutes_remaining: 5,
      terminate_at: null,
      balance: 10,
    });
    addToast({ type: 'info', message: 'user A finished a job' });
    addNotification({
      level: 'warning',
      title: 'A-only notice',
      message: 'must not survive logout',
      expires_at: null,
    });
    setEventStreamStatus('connected');

    resetAppState();

    expect(getQueryClient().getQueryData(['probe'])).toBeUndefined();
    expect(activeProject.id).toBeNull();
    expect(activeProject.takeJobProject('job-1')).toBeNull();
    expect(getStoreValue(activeJobStore)).toBeNull();
    expect(getStoreValue(generationStore).prompt).toBe('');
    expect(getStoreValue(creditWarnings).size).toBe(0);
    expect(getStoreValue(toasts)).toEqual([]);
    expect(getStoreValue(notifications)).toEqual([]);
    expect(getStoreValue(eventStreamStatus)).toBe('disconnected');
  });

  it('a throwing step does not prevent the rest of the reset (A5)', () => {
    getQueryClient().setQueryData(['probe'], 42);
    generationStore.setPrompt('should still be cleared');
    const resetSpy = vi.spyOn(activeProject, 'reset').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => resetAppState()).not.toThrow();

    expect(getQueryClient().getQueryData(['probe'])).toBeUndefined();
    expect(getStoreValue(generationStore).prompt).toBe('');

    resetSpy.mockRestore();
  });

  it('is safe to call when nothing was ever set (idempotent, no throw)', () => {
    expect(() => resetAppState()).not.toThrow();
    expect(() => resetAppState()).not.toThrow();
  });

  it('a synchronously-throwing caches.delete does not prevent the query cache being cleared (A5)', () => {
    getQueryClient().setQueryData(['probe'], 42);
    vi.stubGlobal('caches', {
      delete: () => {
        throw new Error('Cache Storage unavailable');
      },
    });

    expect(() => resetAppState()).not.toThrow();

    expect(getQueryClient().getQueryData(['probe'])).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('deletes the legacy content cache without awaiting cache storage', () => {
    const deleteCache = vi.fn().mockResolvedValue(false);
    vi.stubGlobal('caches', { delete: deleteCache });

    expect(resetAppState()).toBeUndefined();
    expect(deleteCache).toHaveBeenCalledWith(LEGACY_CONTENT_MEDIA_CACHE_NAME);

    vi.unstubAllGlobals();
  });
});

describe('device preferences survive logout (A4)', () => {
  it('does not touch theme/sidebar/pwa-install localStorage keys', () => {
    localStorage.setItem('apex-theme-prefs', JSON.stringify({ theme: 'frost', mode: 'dark' }));
    localStorage.setItem('apex-sidebar-collapsed', 'true');

    setAuth(
      {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      makeUserProfile(),
    );
    clearAuth();

    expect(localStorage.getItem('apex-theme-prefs')).toBe(
      JSON.stringify({ theme: 'frost', mode: 'dark' }),
    );
    expect(localStorage.getItem('apex-sidebar-collapsed')).toBe('true');
  });
});
