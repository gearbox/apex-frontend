import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/pushNotifications', () => ({
  getPushSupport: vi.fn().mockReturnValue('supported'),
  isPushNudgeEligible: vi.fn(),
}));

vi.mock('$lib/stores/pushSubscription.svelte', () => ({
  pushSubscription: { subscribed: false, enable: vi.fn() },
}));

import { pushNudge } from './pushNudge.svelte';
import * as pushService from '$lib/services/pushNotifications';
import { pushSubscription } from '$lib/stores/pushSubscription.svelte';
import { STORAGE_KEYS } from '$lib/utils/constants';

describe('pushNudge store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushNudge.visible = false;
    pushNudge.enabling = false;
    localStorage.clear();
  });

  it('maybeShow() shows the nudge when eligible', () => {
    vi.mocked(pushService.isPushNudgeEligible).mockReturnValue(true);

    pushNudge.maybeShow();

    expect(pushNudge.visible).toBe(true);
  });

  it('dismiss() hides the nudge and persists the flag', () => {
    pushNudge.visible = true;

    pushNudge.dismiss();

    expect(pushNudge.visible).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED)).toBe('1');
  });

  it('does not permanently dismiss the nudge after a transient enable failure', async () => {
    pushNudge.visible = true;
    vi.mocked(pushSubscription.enable).mockResolvedValue({ status: 'service-worker-unavailable' });

    await expect(pushNudge.enable()).resolves.toEqual({ status: 'service-worker-unavailable' });

    expect(pushNudge.visible).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED)).toBeNull();
  });

  it('persists dismissal after successful enable or deliberate permission denial', async () => {
    pushNudge.visible = true;
    vi.mocked(pushSubscription.enable).mockResolvedValue({ status: 'enabled' });

    await pushNudge.enable();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED)).toBe('1');

    localStorage.clear();
    pushNudge.visible = true;
    vi.mocked(pushSubscription.enable).mockResolvedValue({ status: 'permission-denied' });

    await pushNudge.enable();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED)).toBe('1');
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
