import { isBrowser } from '$lib/utils/env';
import { addToast } from '$lib/stores/toasts';
import * as m from '$paraglide/messages';
import {
  getLivePushSubscription,
  getPushSupport,
  preparePushResources,
  reconcileOnLaunch,
  subscribe as subscribePush,
  unsubscribe as unsubscribePush,
  type PushEnableResult,
  type PushEnableStatus,
  type PushSupport,
} from '$lib/services/pushNotifications';
import { STORAGE_KEYS } from '$lib/utils/constants';

function currentPermission(): NotificationPermission {
  return isBrowser() && 'Notification' in window ? Notification.permission : 'denied';
}

class PushSubscriptionState {
  support: PushSupport = $state(isBrowser() ? getPushSupport() : 'unsupported');
  permission: NotificationPermission = $state(currentPermission());
  subscribed = $state(false);
  loading = $state(false);
  lastResult: PushEnableStatus | null = $state(null);
  private refreshPromise: Promise<void> | undefined;
  private removeLifecycleListeners: (() => void) | undefined;

  /**
   * Call after authentication becomes available. Preparation begins without using a user gesture;
   * the actual permission request remains exclusively in `enable()`'s direct click call path.
   */
  init(): () => void {
    this.removeLifecycleListeners?.();
    this.support = isBrowser() ? getPushSupport() : 'unsupported';
    this.permission = currentPermission();

    if (!isBrowser() || this.support !== 'supported') return () => {};

    void preparePushResources();
    void this.refresh();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void this.refresh();
    };
    const refreshOnPageShow = () => void this.refresh();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('pageshow', refreshOnPageShow);

    const cleanup = () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshOnPageShow);
      if (this.removeLifecycleListeners === cleanup) this.removeLifecycleListeners = undefined;
    };
    this.removeLifecycleListeners = cleanup;
    return cleanup;
  }

  /** Re-read permission + live subscription, with reconciliation deduplicated in the service layer. */
  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    const pending = this.doRefresh();
    this.refreshPromise = pending;
    try {
      await pending;
    } finally {
      if (this.refreshPromise === pending) this.refreshPromise = undefined;
    }
  }

  private async doRefresh(): Promise<void> {
    this.support = isBrowser() ? getPushSupport() : 'unsupported';
    this.permission = currentPermission();
    if (!isBrowser() || this.support !== 'supported') {
      this.subscribed = false;
      return;
    }

    if (this.permission === 'granted') await reconcileOnLaunch();

    try {
      const subscription = await getLivePushSubscription();
      const storedEndpoint = localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT);
      // A browser subscription only counts as enabled once this app has registered it with the API.
      this.subscribed =
        this.permission === 'granted' && !!subscription && subscription.endpoint === storedEndpoint;
    } catch {
      // A temporary readiness failure is represented by an off toggle so the user can retry.
      this.subscribed = false;
    } finally {
      this.permission = currentPermission();
    }
  }

  /** Must be invoked directly from a user gesture (click) — see pushNotifications.subscribe(). */
  async enable(): Promise<PushEnableResult> {
    if (this.loading) return { status: 'in-progress' };
    this.loading = true;
    this.lastResult = null;
    try {
      const result = await subscribePush();
      this.lastResult = result.status;
      this.subscribed = result.status === 'enabled';
      if (
        result.status !== 'enabled' &&
        result.status !== 'permission-denied' &&
        result.status !== 'permission-dismissed'
      ) {
        addToast({ type: 'error', message: m.push_toast_subscribe_failed(), durationMs: 5000 });
      }
      return result;
    } catch {
      addToast({ type: 'error', message: m.push_toast_subscribe_failed(), durationMs: 5000 });
      this.lastResult = 'browser-subscribe-failed';
      return { status: 'browser-subscribe-failed' };
    } finally {
      this.permission = currentPermission();
      this.support = isBrowser() ? getPushSupport() : 'unsupported';
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
      this.lastResult = null;
      this.loading = false;
    }
  }
}

export const pushSubscription = new PushSubscriptionState();
