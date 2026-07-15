import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/pushNotifications', () => ({
  getLivePushSubscription: vi.fn(),
  getPushSupport: vi.fn().mockReturnValue('supported'),
  preparePushResources: vi.fn().mockResolvedValue({ status: 'prepared' }),
  reconcileOnLaunch: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('$lib/stores/toasts', () => ({ addToast: vi.fn() }));

import { pushSubscription } from './pushSubscription.svelte';
import * as pushService from '$lib/services/pushNotifications';
import { addToast } from '$lib/stores/toasts';
import { STORAGE_KEYS } from '$lib/utils/constants';

function fakeSubscription(endpoint = 'https://push.example.com/subscription') {
  return { endpoint };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('pushSubscription store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pushService.getPushSupport).mockReturnValue('supported');
    vi.mocked(pushService.preparePushResources).mockResolvedValue({ status: 'prepared' });
    vi.mocked(pushService.reconcileOnLaunch).mockResolvedValue(undefined);
    vi.mocked(pushService.getLivePushSubscription).mockResolvedValue(null);
    pushSubscription.subscribed = false;
    pushSubscription.loading = false;
    pushSubscription.lastResult = null;
    pushSubscription.support = 'supported';
    pushSubscription.permission = 'default';
    localStorage.clear();
  });

  it('enable() sets subscribed=true on an enabled result, without a toast', async () => {
    vi.mocked(pushService.subscribe).mockResolvedValue({ status: 'enabled' });

    await expect(pushSubscription.enable()).resolves.toEqual({ status: 'enabled' });

    expect(pushSubscription.subscribed).toBe(true);
    expect(pushSubscription.loading).toBe(false);
    expect(addToast).not.toHaveBeenCalled();
  });

  it('keeps the toggle off and shows a retryable error on a transient failure', async () => {
    vi.mocked(pushService.subscribe).mockResolvedValue({ status: 'backend-registration-failed' });

    await expect(pushSubscription.enable()).resolves.toEqual({
      status: 'backend-registration-failed',
    });

    expect(pushSubscription.subscribed).toBe(false);
    expect(pushSubscription.lastResult).toBe('backend-registration-failed');
    expect(addToast).toHaveBeenCalledOnce();
  });

  it('does not show a generic error toast for a deliberate permission denial', async () => {
    vi.mocked(pushService.subscribe).mockResolvedValue({ status: 'permission-denied' });

    await expect(pushSubscription.enable()).resolves.toEqual({ status: 'permission-denied' });

    expect(pushSubscription.subscribed).toBe(false);
    expect(pushSubscription.lastResult).toBe('permission-denied');
    expect(addToast).not.toHaveBeenCalled();
  });

  it('returns an in-progress result without double-subscribing while already loading', async () => {
    pushSubscription.loading = true;

    await expect(pushSubscription.enable()).resolves.toEqual({ status: 'in-progress' });
    expect(pushService.subscribe).not.toHaveBeenCalled();
  });

  it('disable() clears subscribed and loading once unsubscribe() settles', async () => {
    pushSubscription.subscribed = true;
    vi.mocked(pushService.unsubscribe).mockResolvedValue(undefined);

    await pushSubscription.disable();

    expect(pushSubscription.subscribed).toBe(false);
    expect(pushSubscription.loading).toBe(false);
  });

  it('refreshes permission and subscription after pageshow from Settings', async () => {
    const notification = { permission: 'granted' as NotificationPermission };
    vi.stubGlobal('Notification', notification);
    const subscription = fakeSubscription();
    vi.mocked(pushService.getLivePushSubscription).mockResolvedValue(
      subscription as PushSubscription,
    );
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, subscription.endpoint);

    const cleanup = pushSubscription.init();
    await flush();
    expect(pushSubscription.permission).toBe('granted');
    expect(pushSubscription.subscribed).toBe(true);

    notification.permission = 'denied';
    window.dispatchEvent(new Event('pageshow'));
    await flush();

    expect(pushSubscription.permission).toBe('denied');
    expect(pushSubscription.subscribed).toBe(false);
    cleanup();
  });

  it('removes foreground listeners on teardown', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' as NotificationPermission });
    const cleanup = pushSubscription.init();
    await flush();
    const callsBeforeCleanup = vi.mocked(pushService.getLivePushSubscription).mock.calls.length;

    cleanup();
    window.dispatchEvent(new Event('pageshow'));
    await flush();

    expect(pushService.getLivePushSubscription).toHaveBeenCalledTimes(callsBeforeCleanup);
  });
});
