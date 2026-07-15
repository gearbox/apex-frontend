import { isBrowser } from '$lib/utils/env';
import { STORAGE_KEYS } from '$lib/utils/constants';
import {
  getPushSupport,
  isPushNudgeEligible,
  type PushEnableResult,
} from '$lib/services/pushNotifications';
import { pushSubscription } from '$lib/stores/pushSubscription.svelte';

function isDismissed(): boolean {
  return isBrowser() && localStorage.getItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED) === '1';
}

function currentPermission(): NotificationPermission {
  return isBrowser() && 'Notification' in window ? Notification.permission : 'denied';
}

class PushNudgeState {
  visible = $state(false);
  enabling = $state(false);

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

  /** Marks an explicit dismissal or a completed enable decision as seen. */
  private markSeen(): void {
    this.visible = false;
    if (isBrowser()) localStorage.setItem(STORAGE_KEYS.PUSH_NUDGE_DISMISSED, '1');
  }

  dismiss(): void {
    this.markSeen();
  }

  async enable(): Promise<PushEnableResult | undefined> {
    if (this.enabling) return undefined;
    this.enabling = true;
    try {
      const result = await pushSubscription.enable();
      // Do not hide a retryable readiness/network/browser/backend failure permanently.
      if (result.status === 'enabled' || result.status === 'permission-denied') {
        this.markSeen();
      }
      return result;
    } finally {
      this.enabling = false;
    }
  }
}

export const pushNudge = new PushNudgeState();
