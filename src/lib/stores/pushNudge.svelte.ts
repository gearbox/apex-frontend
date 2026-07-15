import { isBrowser } from '$lib/utils/env';
import {
  getPushPromptPreference,
  getPushSupport,
  isPushNudgeEligible,
  updatePushPromptPreference,
  type PushEnableResult,
} from '$lib/services/pushNotifications';
import { pushSubscription } from '$lib/stores/pushSubscription.svelte';

function currentPermission(): NotificationPermission {
  return isBrowser() && 'Notification' in window ? Notification.permission : 'denied';
}

class PushNudgeState {
  visible = $state(false);
  enabling = $state(false);

  reset(): void {
    this.visible = false;
    this.enabling = false;
  }

  /**
   * Evaluate the current account's push state and show the nudge when eligible.
   * Called both by standalone-launch orchestration and after a successful generation
   * (SSE job.status_changed → completed) as a contextual fallback trigger.
   */
  maybeShow(): void {
    const userId = pushSubscription.userId;
    if (!isBrowser() || this.visible || !userId) return;

    const preference = getPushPromptPreference(userId);
    const eligible = isPushNudgeEligible({
      support: getPushSupport(),
      permission: currentPermission(),
      subscribed: pushSubscription.subscribed,
      dismissed: preference.dismissed,
      retryPending: preference.retryPending,
    });

    if (eligible) this.visible = true;
  }

  dismiss(): void {
    const userId = pushSubscription.userId;
    this.visible = false;
    if (userId) updatePushPromptPreference(userId, { dismissed: true, retryPending: false });
  }

  async enable(): Promise<PushEnableResult | undefined> {
    if (this.enabling) return undefined;
    this.enabling = true;
    try {
      const result = await pushSubscription.enable();
      // The store persists retry state; only completed decisions dismiss this visible instance.
      if (result.status === 'enabled' || result.status === 'permission-denied') {
        this.visible = false;
      }
      return result;
    } finally {
      this.enabling = false;
    }
  }
}

export const pushNudge = new PushNudgeState();
