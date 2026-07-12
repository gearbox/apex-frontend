import apiClient from '$lib/api/client';
import { isBrowser } from '$lib/utils/env';
import { getInstallPlatform, isStandalone } from '$lib/utils/platform';
import { STORAGE_KEYS } from '$lib/utils/constants';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

/**
 * `needs-install` covers iOS Safari: Web Push works there from iOS 16.4+, but only once the
 * site is installed to the home screen (no PushManager in the regular browser tab).
 */
export function getPushSupport(): PushSupport {
  if (!isBrowser()) return 'unsupported';

  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    return 'supported';
  }

  if (getInstallPlatform() === 'ios' && !isStandalone()) {
    return 'needs-install';
  }

  return 'unsupported';
}

/** Converts a VAPID public key (URL-safe base64) into the Uint8Array `applicationServerKey` needs. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Not `.ready` — that hangs forever if the SW never registers (e.g. push support
 * present but registration failed). A missing registration should fail fast instead.
 */
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error('Service worker is not registered');
  return registration;
}

function subscriptionToRequestBody(subscription: PushSubscription, userAgent: string) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Incomplete push subscription payload');
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    user_agent: userAgent,
  };
}

/**
 * Subscribes to push and registers the subscription with the backend. Must be called
 * from a user gesture (e.g. a toggle click) — `pushManager.subscribe()` is what triggers
 * the permission prompt, and browsers require that to originate from a gesture.
 *
 * On backend failure, unsubscribes locally too — an orphaned browser subscription the
 * backend doesn't know about is worse than no subscription (the toggle would show
 * "enabled" for something that will never deliver).
 */
export async function subscribe(): Promise<boolean> {
  if (!isBrowser()) return false;

  const registration = await getRegistration();

  const { data: vapidData, error: vapidError } = await apiClient.GET('/v1/push/vapid-public-key');
  if (
    vapidError ||
    typeof vapidData !== 'object' ||
    vapidData === null ||
    typeof (vapidData as { public_key?: unknown }).public_key !== 'string'
  ) {
    throw new Error('Failed to fetch VAPID public key');
  }
  const publicKey = (vapidData as { public_key: string }).public_key;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const body = subscriptionToRequestBody(subscription, navigator.userAgent);
  const { error } = await apiClient.POST('/v1/push/subscriptions', { body });

  if (error) {
    await subscription.unsubscribe();
    return false;
  }

  localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, body.endpoint);
  return true;
}

/** Backend failure must not block the local unsubscribe (offline-tolerant). */
export async function unsubscribe(): Promise<void> {
  if (!isBrowser()) return;

  try {
    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      try {
        await apiClient.DELETE('/v1/push/subscriptions', {
          body: { endpoint: subscription.endpoint },
        });
      } catch {
        // Ignored — proceed with local unsubscribe regardless.
      }
      await subscription.unsubscribe();
    }
  } finally {
    localStorage.removeItem(STORAGE_KEYS.PUSH_ENDPOINT);
  }
}

/**
 * Called once from the authenticated root layout. Compares the live browser subscription
 * against the endpoint we last POSTed: if the browser silently rotated it, re-POSTs and
 * updates the stored value; if the stored value points at a subscription that's gone,
 * clears it so the UI falls back to showing the toggle off.
 */
export async function reconcileOnLaunch(): Promise<void> {
  if (!isBrowser() || getPushSupport() !== 'supported') return;
  if (Notification.permission !== 'granted') return;

  try {
    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();
    const storedEndpoint = localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT);

    if (!subscription) {
      if (storedEndpoint) localStorage.removeItem(STORAGE_KEYS.PUSH_ENDPOINT);
      return;
    }

    if (subscription.endpoint === storedEndpoint) return;

    const body = subscriptionToRequestBody(subscription, navigator.userAgent);
    const { error } = await apiClient.POST('/v1/push/subscriptions', { body });
    if (!error) {
      localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, body.endpoint);
    }
  } catch {
    // Best-effort — a failed reconcile just means we retry on the next launch.
  }
}

/* ─── Contextual nudge eligibility (pure) ─── */

export interface PushNudgeEligibilityInput {
  support: PushSupport;
  permission: NotificationPermission;
  subscribed: boolean;
  dismissed: boolean;
}

export function isPushNudgeEligible(input: PushNudgeEligibilityInput): boolean {
  return (
    input.support === 'supported' &&
    input.permission === 'default' &&
    !input.subscribed &&
    !input.dismissed
  );
}
