import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pushSubscription } = vi.hoisted(() => ({
  pushSubscription: { userId: 'user-a', subscribed: false, enable: vi.fn() },
}));

vi.mock('$lib/services/pushNotifications', () => ({
  getPushPromptPreference: vi.fn().mockReturnValue({ dismissed: false, retryPending: false }),
  getPushSupport: vi.fn().mockReturnValue('supported'),
  isPushNudgeEligible: vi.fn(),
  updatePushPromptPreference: vi.fn(),
}));

vi.mock('$lib/stores/pushSubscription.svelte', () => ({ pushSubscription }));

import { pushNudge } from './pushNudge.svelte';
import * as pushService from '$lib/services/pushNotifications';

describe('pushNudge store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushNudge.reset();
    pushSubscription.userId = 'user-a';
    pushSubscription.subscribed = false;
    vi.mocked(pushService.getPushPromptPreference).mockReturnValue({
      dismissed: false,
      retryPending: false,
    });
  });

  it('maybeShow() uses the active user preference and shows an eligible nudge', () => {
    vi.mocked(pushService.isPushNudgeEligible).mockReturnValue(true);

    pushNudge.maybeShow();

    expect(pushService.getPushPromptPreference).toHaveBeenCalledWith('user-a');
    expect(pushNudge.visible).toBe(true);
  });

  it('dismiss() persists only the active user preference', () => {
    pushNudge.visible = true;

    pushNudge.dismiss();

    expect(pushNudge.visible).toBe(false);
    expect(pushService.updatePushPromptPreference).toHaveBeenCalledWith('user-a', {
      dismissed: true,
      retryPending: false,
    });
  });

  it('keeps a retryable failure visible and lets the store persist its retry state', async () => {
    pushNudge.visible = true;
    vi.mocked(pushSubscription.enable).mockResolvedValue({ status: 'service-worker-unavailable' });

    await expect(pushNudge.enable()).resolves.toEqual({ status: 'service-worker-unavailable' });

    expect(pushNudge.visible).toBe(true);
    expect(pushService.updatePushPromptPreference).not.toHaveBeenCalled();
  });

  it('hides after successful enable or a deliberate permission denial', async () => {
    pushNudge.visible = true;
    vi.mocked(pushSubscription.enable).mockResolvedValue({ status: 'enabled' });
    await pushNudge.enable();
    expect(pushNudge.visible).toBe(false);

    pushNudge.visible = true;
    vi.mocked(pushSubscription.enable).mockResolvedValue({ status: 'permission-denied' });
    await pushNudge.enable();
    expect(pushNudge.visible).toBe(false);
  });

  it('does not allow one account preference to be read for another account', () => {
    pushSubscription.userId = 'user-b';
    vi.mocked(pushService.isPushNudgeEligible).mockReturnValue(true);

    pushNudge.maybeShow();

    expect(pushService.getPushPromptPreference).toHaveBeenCalledWith('user-b');
  });

  it('cannot double-submit while enabling', async () => {
    let resolveEnable!: (value: { status: 'enabled' }) => void;
    vi.mocked(pushSubscription.enable).mockReturnValue(
      new Promise((resolve) => {
        resolveEnable = resolve;
      }),
    );

    const first = pushNudge.enable();
    const second = pushNudge.enable();
    await expect(second).resolves.toBeUndefined();
    expect(pushSubscription.enable).toHaveBeenCalledOnce();

    resolveEnable({ status: 'enabled' });
    await first;
    expect(pushNudge.enabling).toBe(false);
  });
});
