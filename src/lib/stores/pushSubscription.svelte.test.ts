import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/pushNotifications', () => ({
  getLivePushSubscription: vi.fn(),
  getPushPromptPreference: vi.fn(),
  getPushSupport: vi.fn().mockReturnValue('supported'),
  isRetryablePushEnableStatus: vi.fn((status: string) =>
    [
      'service-worker-unavailable',
      'vapid-unavailable',
      'browser-subscribe-failed',
      'backend-registration-failed',
    ].includes(status),
  ),
  preparePushResources: vi.fn().mockResolvedValue({ status: 'prepared' }),
  readStoredPushRegistration: vi.fn(),
  reconcileOnLaunch: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  updatePushPromptPreference: vi.fn(),
}));

vi.mock('$lib/stores/toasts', () => ({ addToast: vi.fn() }));

import {
  isSubscribedFrom,
  isSubscribedFromStatus,
  pushSubscription,
  shouldShowSubscribeErrorToast,
} from './pushSubscription.svelte';
import * as pushService from '$lib/services/pushNotifications';
import { addToast } from '$lib/stores/toasts';

const USER_A = 'user-a';
const USER_B = 'user-b';

function fakeSubscription(endpoint = 'https://push.example.com/subscription') {
  return { endpoint } as PushSubscription;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('pushSubscription store', () => {
  beforeEach(() => {
    pushSubscription.reset();
    vi.clearAllMocks();
    vi.mocked(pushService.getPushSupport).mockReturnValue('supported');
    vi.mocked(pushService.preparePushResources).mockResolvedValue({ status: 'prepared' });
    vi.mocked(pushService.reconcileOnLaunch).mockResolvedValue(undefined);
    vi.mocked(pushService.getLivePushSubscription).mockResolvedValue(null);
    vi.mocked(pushService.readStoredPushRegistration).mockReturnValue(null);
    vi.stubGlobal('Notification', { permission: 'default' as NotificationPermission });
  });

  afterEach(() => {
    pushSubscription.reset();
    vi.unstubAllGlobals();
  });

  it('enable() sets subscribed=true on an enabled result without a toast', async () => {
    pushSubscription.init(USER_A);
    vi.mocked(pushService.subscribe).mockResolvedValue({ status: 'enabled' });

    await expect(pushSubscription.enable()).resolves.toEqual({ status: 'enabled' });

    expect(pushSubscription.subscribed).toBe(true);
    expect(pushSubscription.loading).toBe(false);
    expect(addToast).not.toHaveBeenCalled();
  });

  it('keeps the toggle off and saves a retry path on a transient enable failure', async () => {
    pushSubscription.init(USER_A);
    vi.mocked(pushService.subscribe).mockResolvedValue({ status: 'backend-registration-failed' });

    await expect(pushSubscription.enable()).resolves.toEqual({
      status: 'backend-registration-failed',
    });

    expect(pushSubscription.subscribed).toBe(false);
    expect(pushSubscription.lastResult).toBe('backend-registration-failed');
    expect(pushService.updatePushPromptPreference).toHaveBeenCalledWith(USER_A, {
      dismissed: false,
      retryPending: true,
    });
    expect(addToast).toHaveBeenCalledOnce();
  });

  it('does not show a generic error toast for a deliberate permission denial', async () => {
    pushSubscription.init(USER_A);
    vi.mocked(pushService.subscribe).mockResolvedValue({ status: 'permission-denied' });

    await expect(pushSubscription.enable()).resolves.toEqual({ status: 'permission-denied' });

    expect(pushSubscription.subscribed).toBe(false);
    expect(pushSubscription.lastResult).toBe('permission-denied');
    expect(pushService.updatePushPromptPreference).toHaveBeenCalledWith(USER_A, {
      dismissed: false,
      retryPending: false,
    });
    expect(addToast).not.toHaveBeenCalled();
  });

  it('returns an in-progress result without double-subscribing while already loading', async () => {
    pushSubscription.init(USER_A);
    pushSubscription.loading = true;

    await expect(pushSubscription.enable()).resolves.toEqual({ status: 'in-progress' });
    expect(pushService.subscribe).not.toHaveBeenCalled();
  });

  it('uses the final permission snapshot after reconciliation awaits', async () => {
    const notification = { permission: 'granted' as NotificationPermission };
    vi.stubGlobal('Notification', notification);
    const pending = deferred<void>();
    vi.mocked(pushService.reconcileOnLaunch).mockReturnValue(pending.promise);
    vi.mocked(pushService.getLivePushSubscription).mockResolvedValue(fakeSubscription());
    vi.mocked(pushService.readStoredPushRegistration).mockReturnValue({
      version: 1,
      endpoint: 'https://push.example.com/subscription',
      userId: USER_A,
    });

    pushSubscription.init(USER_A);
    notification.permission = 'denied';
    pending.resolve();
    await flush();

    expect(pushSubscription.permission).toBe('denied');
    expect(pushSubscription.subscribed).toBe(false);
  });

  it('clears a stale failure result when refresh confirms the current user registration', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });
    vi.mocked(pushService.getLivePushSubscription).mockResolvedValue(fakeSubscription());
    vi.mocked(pushService.readStoredPushRegistration).mockReturnValue({
      version: 1,
      endpoint: 'https://push.example.com/subscription',
      userId: USER_A,
    });
    pushSubscription.lastResult = 'backend-registration-failed';

    pushSubscription.init(USER_A);
    await flush();

    expect(pushSubscription.subscribed).toBe(true);
    expect(pushSubscription.lastResult).toBe('enabled');
  });

  it('passes the authenticated user to reconciliation and resets for an account switch', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });

    pushSubscription.init(USER_A);
    await flush();
    pushSubscription.init(USER_B);
    await flush();

    expect(pushService.reconcileOnLaunch).toHaveBeenCalledWith(USER_A, true);
    expect(pushService.reconcileOnLaunch).toHaveBeenCalledWith(USER_B, true);
    expect(pushSubscription.userId).toBe(USER_B);
  });

  it('ignores User A refresh work that resolves after User B has initialized', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });
    const firstReconcile = deferred<void>();
    vi.mocked(pushService.reconcileOnLaunch)
      .mockReturnValueOnce(firstReconcile.promise)
      .mockResolvedValueOnce(undefined);
    vi.mocked(pushService.getLivePushSubscription).mockResolvedValue(fakeSubscription());
    vi.mocked(pushService.readStoredPushRegistration)
      .mockReturnValueOnce({
        version: 1,
        endpoint: 'https://push.example.com/subscription',
        userId: USER_B,
      })
      .mockReturnValue({
        version: 1,
        endpoint: 'https://push.example.com/subscription',
        userId: USER_B,
      });

    pushSubscription.init(USER_A);
    pushSubscription.init(USER_B);
    await flush();
    firstReconcile.resolve();
    await flush();

    expect(pushSubscription.userId).toBe(USER_B);
    expect(pushSubscription.subscribed).toBe(true);
  });

  it('keeps the toggle enabled and retryable after a failed local unsubscribe', async () => {
    pushSubscription.init(USER_A);
    pushSubscription.subscribed = true;
    vi.mocked(pushService.unsubscribe).mockResolvedValue({ status: 'browser-unsubscribe-failed' });

    await expect(pushSubscription.disable()).resolves.toEqual({
      status: 'browser-unsubscribe-failed',
    });

    expect(pushSubscription.subscribed).toBe(true);
    expect(pushSubscription.lastResult).toBe('browser-unsubscribe-failed');
    expect(addToast).toHaveBeenCalledOnce();
  });

  it('clears subscription and retry state only after a successful disable', async () => {
    pushSubscription.init(USER_A);
    pushSubscription.subscribed = true;
    vi.mocked(pushService.unsubscribe).mockResolvedValue({ status: 'disabled' });

    await expect(pushSubscription.disable()).resolves.toEqual({ status: 'disabled' });

    expect(pushSubscription.subscribed).toBe(false);
    expect(pushSubscription.lastResult).toBeNull();
    expect(pushService.updatePushPromptPreference).toHaveBeenCalledWith(USER_A, {
      dismissed: true,
      retryPending: false,
    });
  });

  it('removes foreground listeners on teardown', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });
    const cleanup = pushSubscription.init(USER_A);
    await flush();
    const callsBeforeCleanup = vi.mocked(pushService.getLivePushSubscription).mock.calls.length;

    cleanup();
    window.dispatchEvent(new Event('pageshow'));
    await flush();

    expect(pushService.getLivePushSubscription).toHaveBeenCalledTimes(callsBeforeCleanup);
  });
});

describe('pushSubscription initialSyncComplete readiness', () => {
  it('is false immediately after init(userId)', () => {
    const pending = deferred<PushSubscription | null>();
    vi.mocked(pushService.getLivePushSubscription).mockReturnValue(pending.promise);

    pushSubscription.init(USER_A);

    expect(pushSubscription.initialSyncComplete).toBe(false);
  });

  it('becomes true only after the initial refresh settles', async () => {
    const pending = deferred<PushSubscription | null>();
    vi.mocked(pushService.getLivePushSubscription).mockReturnValue(pending.promise);

    pushSubscription.init(USER_A);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(false);

    pending.resolve(null);
    await flush();

    expect(pushSubscription.initialSyncComplete).toBe(true);
  });

  it('reset() returns readiness to false', async () => {
    pushSubscription.init(USER_A);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(true);

    pushSubscription.reset();

    expect(pushSubscription.initialSyncComplete).toBe(false);
  });

  it('a foreground refresh does not represent a second initial launch', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });
    const cleanup = pushSubscription.init(USER_A);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(true);

    const pending = deferred<PushSubscription | null>();
    vi.mocked(pushService.getLivePushSubscription).mockReturnValue(pending.promise);
    window.dispatchEvent(new Event('pageshow'));
    // A foreground refresh must never flip readiness back to false while in flight.
    expect(pushSubscription.initialSyncComplete).toBe(true);

    pending.resolve(null);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(true);

    cleanup();
  });

  it('a deferred User A refresh cannot mark readiness after switching to User B', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });
    const pendingA = deferred<PushSubscription | null>();
    const pendingB = deferred<PushSubscription | null>();
    vi.mocked(pushService.getLivePushSubscription)
      .mockReturnValueOnce(pendingA.promise)
      .mockReturnValueOnce(pendingB.promise);

    pushSubscription.init(USER_A);
    pushSubscription.init(USER_B);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(false);

    pendingA.resolve(null);
    await flush();
    expect(pushSubscription.userId).toBe(USER_B);
    expect(pushSubscription.initialSyncComplete).toBe(false);

    pendingB.resolve(null);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(true);
  });

  it('gives User B independent readiness after switching from an already-settled User A', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });
    pushSubscription.init(USER_A);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(true);

    const pendingB = deferred<PushSubscription | null>();
    vi.mocked(pushService.getLivePushSubscription).mockReturnValue(pendingB.promise);
    pushSubscription.init(USER_B);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(false);

    pendingB.resolve(null);
    await flush();
    expect(pushSubscription.initialSyncComplete).toBe(true);
  });

  it('settles readiness immediately when push is unsupported', () => {
    vi.mocked(pushService.getPushSupport).mockReturnValue('unsupported');

    pushSubscription.init(USER_A);

    expect(pushSubscription.initialSyncComplete).toBe(true);
  });

  it('settles readiness immediately when iOS needs-install', () => {
    vi.mocked(pushService.getPushSupport).mockReturnValue('needs-install');

    pushSubscription.init(USER_A);

    expect(pushSubscription.initialSyncComplete).toBe(true);
  });

  it('settles readiness conservatively after a retryable initial refresh failure', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });
    vi.mocked(pushService.reconcileOnLaunch).mockRejectedValue(new Error('network error'));

    pushSubscription.init(USER_A);
    await flush();

    expect(pushSubscription.initialSyncComplete).toBe(true);
    expect(pushSubscription.subscribed).toBe(false);
  });
});

describe('push subscription pure helpers', () => {
  const subscription = fakeSubscription('https://push.example.com/owned');
  const owned = { version: 1 as const, endpoint: subscription.endpoint, userId: USER_A };

  it.each([
    ['granted', subscription, owned, USER_A, true],
    ['default', subscription, owned, USER_A, false],
    ['denied', subscription, owned, USER_A, false],
    ['granted', null, owned, USER_A, false],
    ['granted', subscription, null, USER_A, false],
    ['granted', subscription, { ...owned, endpoint: 'other' }, USER_A, false],
    ['granted', subscription, { ...owned, userId: USER_B }, USER_A, false],
  ] as const)(
    'derives subscribed=%s only for matching permission, endpoint, and owner',
    (permission, live, registration, userId, expected) => {
      expect(isSubscribedFrom(permission, live, registration, userId)).toBe(expected);
    },
  );

  it.each([
    ['enabled', false],
    ['permission-denied', false],
    ['permission-dismissed', false],
    ['needs-install', false],
    ['service-worker-unavailable', true],
    ['vapid-unavailable', true],
    ['browser-subscribe-failed', true],
    ['backend-registration-failed', true],
    ['unsupported', false],
    ['in-progress', false],
  ] as const)('maps toast visibility for every enable status: %s', (status, expectedToast) => {
    expect(shouldShowSubscribeErrorToast(status)).toBe(expectedToast);
    expect(isSubscribedFromStatus(status)).toBe(status === 'enabled');
  });
});
