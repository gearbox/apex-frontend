import { isBrowser } from '$lib/utils/env';
import { addToast } from '$lib/stores/toasts';
import * as m from '$paraglide/messages';
import {
  getLivePushSubscription,
  getPushSupport,
  getPushPromptPreference,
  isRetryablePushEnableStatus,
  preparePushResources,
  readStoredPushRegistration,
  reconcileOnLaunch,
  subscribe as subscribePush,
  unsubscribe as unsubscribePush,
  updatePushPromptPreference,
  type PushDisableResult,
  type PushDisableStatus,
  type PushEnableResult,
  type PushEnableStatus,
  type PushSupport,
  type StoredPushRegistration,
} from '$lib/services/pushNotifications';

export type PushUiStatus = PushEnableStatus | PushDisableStatus;

function currentPermission(): NotificationPermission {
  return isBrowser() && 'Notification' in window ? Notification.permission : 'denied';
}

/** Pure ownership-aware state derivation used by refresh and direct unit tests. */
export function isSubscribedFrom(
  permission: NotificationPermission,
  subscription: PushSubscription | null,
  registration: StoredPushRegistration | null,
  currentUserId: string,
): boolean {
  return (
    permission === 'granted' &&
    !!subscription &&
    registration?.endpoint === subscription.endpoint &&
    registration.userId === currentUserId
  );
}

/** A successful enable result is the only enable result that may turn the toggle on. */
export function isSubscribedFromStatus(status: PushEnableStatus): boolean {
  return status === 'enabled';
}

/** Keep expected user choices quiet; surface only retryable subscription setup failures. */
export function shouldShowSubscribeErrorToast(status: PushEnableStatus): boolean {
  switch (status) {
    case 'service-worker-unavailable':
    case 'vapid-unavailable':
    case 'browser-subscribe-failed':
    case 'backend-registration-failed':
      return true;
    case 'enabled':
    case 'permission-denied':
    case 'permission-dismissed':
    case 'needs-install':
    case 'unsupported':
    case 'in-progress':
      return false;
  }
}

export class PushSubscriptionState {
  support: PushSupport = $state(isBrowser() ? getPushSupport() : 'unsupported');
  permission: NotificationPermission = $state(currentPermission());
  subscribed = $state(false);
  loading = $state(false);
  lastResult: PushUiStatus | null = $state(null);
  private refreshPromise: Promise<void> | undefined;
  private refreshUserId: string | undefined;
  private refreshGeneration = 0;
  private refreshRevision = 0;
  private removeLifecycleListeners: (() => void) | undefined;
  private activeUserId: string | undefined;
  private generation = 0;
  private stateRevision = 0;

  get userId(): string | undefined {
    return this.activeUserId;
  }

  private isCurrent(userId: string, generation: number, revision?: number): boolean {
    return (
      this.activeUserId === userId &&
      this.generation === generation &&
      (revision === undefined || this.stateRevision === revision)
    );
  }

  private normalizeUnavailableState(
    support: PushSupport,
    permission: NotificationPermission,
  ): void {
    this.support = support;
    this.permission = permission;
    this.subscribed = false;
    if (permission === 'denied') {
      this.lastResult = 'permission-denied';
    } else if (support !== 'supported') {
      this.lastResult = null;
    }
  }

  /**
   * Call after authentication becomes available. Switching users invalidates every previous
   * async result and replaces foreground listeners so account state cannot leak across sessions.
   */
  init(userId: string): () => void {
    this.removeLifecycleListeners?.();
    this.removeLifecycleListeners = undefined;
    this.generation += 1;
    this.stateRevision += 1;
    this.activeUserId = userId;
    this.refreshPromise = undefined;
    this.refreshUserId = undefined;
    this.loading = false;
    this.subscribed = false;
    this.lastResult = null;

    const support = isBrowser() ? getPushSupport() : 'unsupported';
    const permission = currentPermission();
    this.normalizeUnavailableState(support, permission);

    if (!isBrowser() || support !== 'supported') return () => {};

    void preparePushResources();
    void this.refresh(true);

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

  /** Remove account-bound listeners and invalidate in-flight work without changing storage. */
  reset(): void {
    this.removeLifecycleListeners?.();
    this.removeLifecycleListeners = undefined;
    this.generation += 1;
    this.stateRevision += 1;
    this.activeUserId = undefined;
    this.refreshPromise = undefined;
    this.refreshUserId = undefined;
    this.loading = false;
    this.subscribed = false;
    this.lastResult = null;
    this.support = isBrowser() ? getPushSupport() : 'unsupported';
    this.permission = currentPermission();
  }

  /** Re-read permission + live subscription, with reconciliation de-duplicated per user. */
  async refresh(forceRegistration = false): Promise<void> {
    const userId = this.activeUserId;
    const generation = this.generation;
    const revision = this.stateRevision;
    if (!userId) return;
    if (
      this.refreshPromise &&
      this.refreshUserId === userId &&
      this.refreshGeneration === generation &&
      this.refreshRevision === revision
    ) {
      return this.refreshPromise;
    }

    const pending = this.doRefresh(userId, generation, revision, forceRegistration);
    this.refreshPromise = pending;
    this.refreshUserId = userId;
    this.refreshGeneration = generation;
    this.refreshRevision = revision;
    try {
      await pending;
    } finally {
      if (this.refreshPromise === pending) {
        this.refreshPromise = undefined;
        this.refreshUserId = undefined;
      }
    }
  }

  private async doRefresh(
    userId: string,
    generation: number,
    revision: number,
    forceRegistration: boolean,
  ): Promise<void> {
    const support = isBrowser() ? getPushSupport() : 'unsupported';
    const initialPermission = currentPermission();
    if (!isBrowser() || support !== 'supported') {
      if (this.isCurrent(userId, generation, revision)) {
        this.normalizeUnavailableState(support, initialPermission);
      }
      return;
    }

    let subscription: PushSubscription | null = null;
    let registration: StoredPushRegistration | null = null;
    try {
      if (initialPermission === 'granted') await reconcileOnLaunch(userId, forceRegistration);
      subscription = await getLivePushSubscription();
      registration = readStoredPushRegistration();
    } catch {
      // A temporary readiness failure is represented by an off toggle so the user can retry.
    }

    // This must be read after every await so the derived state cannot pair denied with enabled.
    const finalPermission = currentPermission();
    if (!this.isCurrent(userId, generation, revision)) return;

    this.support = isBrowser() ? getPushSupport() : 'unsupported';
    this.permission = finalPermission;
    this.subscribed = isSubscribedFrom(finalPermission, subscription, registration, userId);
    if (this.subscribed) {
      this.lastResult = 'enabled';
    } else if (finalPermission === 'denied') {
      this.lastResult = 'permission-denied';
    } else if (this.support !== 'supported') {
      this.lastResult = null;
    }
  }

  private applyEnableResult(
    result: PushEnableResult,
    userId: string,
    generation: number,
    revision: number,
  ): void {
    if (!this.isCurrent(userId, generation, revision)) return;

    this.lastResult = result.status;
    this.subscribed = isSubscribedFromStatus(result.status);
    if (result.status === 'enabled' || result.status === 'permission-denied') {
      updatePushPromptPreference(userId, { dismissed: false, retryPending: false });
    } else if (isRetryablePushEnableStatus(result.status)) {
      updatePushPromptPreference(userId, { dismissed: false, retryPending: true });
    }
    if (shouldShowSubscribeErrorToast(result.status)) {
      addToast({ type: 'error', message: m.push_toast_subscribe_failed(), durationMs: 5000 });
    }
  }

  /** Must be invoked directly from a user gesture (click) — see pushNotifications.subscribe(). */
  async enable(): Promise<PushEnableResult> {
    if (this.loading) return { status: 'in-progress' };
    const userId = this.activeUserId;
    const generation = this.generation;
    if (!userId) return { status: 'unsupported' };

    const revision = ++this.stateRevision;
    this.loading = true;
    this.lastResult = null;
    try {
      const result = await subscribePush(userId);
      this.applyEnableResult(result, userId, generation, revision);
      return result;
    } catch {
      const result: PushEnableResult = { status: 'browser-subscribe-failed' };
      this.applyEnableResult(result, userId, generation, revision);
      return result;
    } finally {
      if (this.isCurrent(userId, generation, revision)) {
        this.permission = currentPermission();
        this.support = isBrowser() ? getPushSupport() : 'unsupported';
        this.loading = false;
      }
    }
  }

  async disable(): Promise<PushDisableResult> {
    const userId = this.activeUserId;
    const generation = this.generation;
    if (!userId) return { status: 'unsupported' };
    if (this.loading) return { status: 'browser-unsubscribe-failed' };

    const revision = ++this.stateRevision;
    this.loading = true;
    try {
      const result = await unsubscribePush(userId);
      if (!this.isCurrent(userId, generation, revision)) return result;

      if (result.status === 'disabled') {
        this.subscribed = false;
        this.lastResult = null;
        updatePushPromptPreference(userId, { dismissed: true, retryPending: false });
      } else {
        // A false/rejected local unsubscribe is not a successful disable and must remain retryable.
        this.lastResult = result.status;
        addToast({ type: 'error', message: m.push_toast_subscribe_failed(), durationMs: 5000 });
      }
      return result;
    } finally {
      if (this.isCurrent(userId, generation, revision)) {
        this.permission = currentPermission();
        this.support = isBrowser() ? getPushSupport() : 'unsupported';
        this.loading = false;
      }
    }
  }

  /** Exposed for nudge tests and consumers that need the current account preference. */
  get promptPreference(): ReturnType<typeof getPushPromptPreference> | undefined {
    return this.activeUserId ? getPushPromptPreference(this.activeUserId) : undefined;
  }
}

export const pushSubscription = new PushSubscriptionState();
