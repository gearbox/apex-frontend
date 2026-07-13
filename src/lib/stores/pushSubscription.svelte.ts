import { isBrowser } from '$lib/utils/env';
import { addToast } from '$lib/stores/toasts';
import * as m from '$paraglide/messages';
import {
  getPushSupport,
  reconcileOnLaunch,
  subscribe as subscribePush,
  unsubscribe as unsubscribePush,
  type PushSupport,
} from '$lib/services/pushNotifications';

function currentPermission(): NotificationPermission {
  return isBrowser() && 'Notification' in window ? Notification.permission : 'denied';
}

class PushSubscriptionState {
  support: PushSupport = $state(isBrowser() ? getPushSupport() : 'unsupported');
  permission: NotificationPermission = $state(currentPermission());
  subscribed = $state(false);
  loading = $state(false);

  /** Call once from the authenticated root layout: reconciles with the backend, then syncs UI state. */
  async init(): Promise<void> {
    if (!isBrowser() || this.support !== 'supported') return;

    await reconcileOnLaunch();

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      this.subscribed = !!subscription;
    } catch {
      // Non-critical: leave `subscribed` at its last known value.
    }
    this.permission = currentPermission();
  }

  /** Must be invoked directly from a user gesture (click) — see pushNotifications.subscribe(). */
  async enable(): Promise<boolean> {
    if (this.loading) return false;
    this.loading = true;
    try {
      const ok = await subscribePush();
      this.subscribed = ok;
      if (!ok) {
        addToast({ type: 'error', message: m.push_toast_subscribe_failed(), durationMs: 5000 });
      }
      return ok;
    } catch {
      addToast({ type: 'error', message: m.push_toast_subscribe_failed(), durationMs: 5000 });
      return false;
    } finally {
      this.permission = currentPermission();
      this.loading = false;
    }
  }

  async disable(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      await unsubscribePush();
    } finally {
      this.subscribed = false;
      this.loading = false;
    }
  }
}

export const pushSubscription = new PushSubscriptionState();
