import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/pushNotifications', () => ({
  getPushSupport: vi.fn().mockReturnValue('supported'),
  reconcileOnLaunch: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('$lib/stores/toasts', () => ({ addToast: vi.fn() }));

import { pushSubscription } from './pushSubscription.svelte';
import * as pushService from '$lib/services/pushNotifications';
import { addToast } from '$lib/stores/toasts';

describe('pushSubscription store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushSubscription.subscribed = false;
    pushSubscription.loading = false;
  });

  it('enable() sets subscribed=true on success, without a toast', async () => {
    vi.mocked(pushService.subscribe).mockResolvedValue(true);

    const ok = await pushSubscription.enable();

    expect(ok).toBe(true);
    expect(pushSubscription.subscribed).toBe(true);
    expect(pushSubscription.loading).toBe(false);
    expect(addToast).not.toHaveBeenCalled();
  });

  it('enable() surfaces a toast and leaves subscribed=false when subscribe() returns false', async () => {
    vi.mocked(pushService.subscribe).mockResolvedValue(false);

    const ok = await pushSubscription.enable();

    expect(ok).toBe(false);
    expect(pushSubscription.subscribed).toBe(false);
    expect(addToast).toHaveBeenCalledOnce();
  });

  it('enable() surfaces a toast when subscribe() throws', async () => {
    vi.mocked(pushService.subscribe).mockRejectedValue(new Error('boom'));

    const ok = await pushSubscription.enable();

    expect(ok).toBe(false);
    expect(pushSubscription.subscribed).toBe(false);
    expect(addToast).toHaveBeenCalledOnce();
  });

  it('enable() is a no-op while already loading', async () => {
    pushSubscription.loading = true;

    const ok = await pushSubscription.enable();

    expect(ok).toBe(false);
    expect(pushService.subscribe).not.toHaveBeenCalled();
  });

  it('disable() clears subscribed and loading once unsubscribe() settles', async () => {
    pushSubscription.subscribed = true;
    vi.mocked(pushService.unsubscribe).mockResolvedValue(undefined);

    await pushSubscription.disable();

    expect(pushSubscription.subscribed).toBe(false);
    expect(pushSubscription.loading).toBe(false);
  });

  it('disable() is a no-op while already loading', async () => {
    pushSubscription.loading = true;

    await pushSubscription.disable();

    expect(pushService.unsubscribe).not.toHaveBeenCalled();
  });
});
