import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/pushNotifications', () => ({
  getPushSupport: vi.fn().mockReturnValue('supported'),
  isPushNudgeEligible: vi.fn(),
}));

vi.mock('$lib/stores/pushSubscription.svelte', () => ({
  pushSubscription: { subscribed: false, enable: vi.fn().mockResolvedValue(true) },
}));

import { pushNudge } from './pushNudge.svelte';
import * as pushService from '$lib/services/pushNotifications';
import { pushSubscription } from '$lib/stores/pushSubscription.svelte';
import { STORAGE_KEYS } from '$lib/utils/constants';

describe('pushNudge store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushNudge.visible = false;
    localStorage.clear();
  });

  it('maybeShow() shows the nudge when eligible', () => {
    vi.mocked(pushService.isPushNudgeEligible).mockReturnValue(true);

    pushNudge.maybeShow();

    expect(pushNudge.visible).toBe(true);
  });

  it('maybeShow() does nothing when not eligible', () => {
    vi.mocked(pushService.isPushNudgeEligible).mockReturnValue(false);

    pushNudge.maybeShow();

    expect(pushNudge.visible).toBe(false);
  });

  it('maybeShow() is a no-op once already visible', () => {
    vi.mocked(pushService.isPushNudgeEligible).mockReturnValue(true);
    pushNudge.maybeShow();
    vi.mocked(pushService.isPushNudgeEligible).mockClear();

    pushNudge.maybeShow();

    expect(pushService.isPushNudgeEligible).not.toHaveBeenCalled();
  });

  it('dismiss() hides the nudge and persists the flag', () => {
    pushNudge.visible = true;

    pushNudge.dismiss();

    expect(pushNudge.visible).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED)).toBe('1');
  });

  it('enable() persists the dismissed flag and delegates to pushSubscription.enable()', async () => {
    pushNudge.visible = true;

    await pushNudge.enable();

    expect(pushNudge.visible).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED)).toBe('1');
    expect(pushSubscription.enable).toHaveBeenCalledOnce();
  });
});
