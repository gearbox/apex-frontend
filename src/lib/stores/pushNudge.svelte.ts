import { isBrowser } from '$lib/utils/env';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { getPushSupport, isPushNudgeEligible } from '$lib/services/pushNotifications';
import { pushSubscription } from '$lib/stores/pushSubscription.svelte';

function isDismissed(): boolean {
  return isBrowser() && localStorage.getItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED) === '1';
}

function currentPermission(): NotificationPermission {
  return isBrowser() && 'Notification' in window ? Notification.permission : 'denied';
}

class PushNudgeState {
  visible = $state(false);

  /** Called after the first successful generation (SSE job.status_changed → completed). */
  maybeShow(): void {
    if (!isBrowser() || this.visible) return;

    const eligible = isPushNudgeEligible({
      support: getPushSupport(),
      permission: currentPermission(),
      subscribed: pushSubscription.subscribed,
      dismissed: isDismissed(),
    });

    if (eligible) this.visible = true;
  }

  /** Marks the nudge as seen so it never shows again — used by both Enable and Dismiss. */
  private markSeen(): void {
    this.visible = false;
    if (isBrowser()) localStorage.setItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED, '1');
  }

  dismiss(): void {
    this.markSeen();
  }

  async enable(): Promise<void> {
    this.markSeen();
    await pushSubscription.enable();
  }
}

export const pushNudge = new PushNudgeState();
