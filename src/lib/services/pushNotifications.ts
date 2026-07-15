import apiClient from '$lib/api/client';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { isBrowser } from '$lib/utils/env';
import { getInstallPlatform, isStandalone } from '$lib/utils/platform';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export type PushEnableStatus =
  | 'enabled'
  | 'permission-denied'
  | 'permission-dismissed'
  | 'needs-install'
  | 'service-worker-unavailable'
  | 'vapid-unavailable'
  | 'browser-subscribe-failed'
  | 'backend-registration-failed'
  | 'unsupported'
  | 'in-progress';

export interface PushEnableResult {
  status: PushEnableStatus;
}

export type PushPreparationStatus =
  | 'prepared'
  | 'needs-install'
  | 'service-worker-unavailable'
  | 'vapid-unavailable'
  | 'unsupported';

export interface PushPreparationResult {
  status: PushPreparationStatus;
}

interface PreparedPushResources {
  registration: ServiceWorkerRegistration;
  vapidPublicKey: string;
}

type PushResourceFailureStatus = Extract<
  PushEnableStatus,
  'service-worker-unavailable' | 'vapid-unavailable'
>;

class PushSetupError extends Error {
  constructor(
    readonly status: PushResourceFailureStatus,
    message: string,
  ) {
    super(message);
    this.name = 'PushSetupError';
  }
}

/** A bounded fallback for `navigator.serviceWorker.ready`, which can otherwise never settle. */
export const PUSH_SERVICE_WORKER_READY_TIMEOUT_MS = 10_000;

let capturedRegistration: ServiceWorkerRegistration | undefined;
let preparationPromise: Promise<PreparedPushResources> | undefined;
let reconciliationPromise: Promise<void> | undefined;

/**
 * `needs-install` is deliberately checked first on iOS: Web Push is only available to
 * Home Screen apps there, even if a browser tab happens to expose related globals.
 */
export function getPushSupport(): PushSupport {
  if (!isBrowser()) return 'unsupported';

  if (getInstallPlatform() === 'ios' && !isStandalone()) return 'needs-install';

  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    return 'supported';
  }

  return 'unsupported';
}

/** Capture the PWA lifecycle registration so push preparation does not race its initial setup. */
export function setPushServiceWorkerRegistration(registration: ServiceWorkerRegistration): void {
  capturedRegistration = registration;
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

function safeErrorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'UnknownError', message: 'Unknown push setup error' };
}

/** Diagnostics intentionally contain no endpoint, VAPID key, subscription key, or auth data. */
function reportPushFailure(stage: string, error: unknown): void {
  console.warn('[push] setup failed', { stage, error: safeErrorDetails(error) });
}

function isPushSetupError(error: unknown): error is PushSetupError {
  return error instanceof PushSetupError;
}

function resourceFailureResult(error: unknown): { status: PushResourceFailureStatus } {
  return { status: isPushSetupError(error) ? error.status : 'service-worker-unavailable' };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      reject(
        new PushSetupError('service-worker-unavailable', 'Service worker readiness timed out'),
      );
    }, timeoutMs);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/**
 * Prefers the PWA lifecycle registration, then checks the active registration, then waits a
 * bounded amount of time for a registration that is still being installed.
 */
async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  if (capturedRegistration) return capturedRegistration;

  if (!('serviceWorker' in navigator)) {
    throw new PushSetupError('service-worker-unavailable', 'Service workers are unavailable');
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      capturedRegistration = registration;
      return registration;
    }

    if (!navigator.serviceWorker.ready) {
      throw new PushSetupError('service-worker-unavailable', 'Service worker is not registered');
    }

    const readyRegistration = await withTimeout(
      navigator.serviceWorker.ready,
      PUSH_SERVICE_WORKER_READY_TIMEOUT_MS,
    );
    capturedRegistration = readyRegistration;
    return readyRegistration;
  } catch (error) {
    if (isPushSetupError(error)) throw error;
    throw new PushSetupError('service-worker-unavailable', 'Service worker is unavailable');
  }
}

async function fetchVapidPublicKey(): Promise<string> {
  try {
    const { data, error } = await apiClient.GET('/v1/push/vapid-public-key');
    if (
      error ||
      typeof data !== 'object' ||
      data === null ||
      typeof (data as { public_key?: unknown }).public_key !== 'string'
    ) {
      throw new Error('VAPID public key is unavailable');
    }
    return (data as { public_key: string }).public_key;
  } catch {
    throw new PushSetupError('vapid-unavailable', 'VAPID public key is unavailable');
  }
}

function getPreparedPushResources(): Promise<PreparedPushResources> {
  if (preparationPromise) return preparationPromise;

  const pending = (async () => ({
    registration: await getPushRegistration(),
    vapidPublicKey: await fetchVapidPublicKey(),
  }))();
  preparationPromise = pending;

  // A transient browser/network failure must not poison all later retries.
  void pending.catch((error: unknown) => {
    if (preparationPromise === pending) preparationPromise = undefined;
    reportPushFailure(isPushSetupError(error) ? error.status : 'preparation', error);
  });

  return pending;
}

/** Start and cache service-worker/VAPID preparation after authentication is available. */
export async function preparePushResources(): Promise<PushPreparationResult> {
  const support = getPushSupport();
  if (support !== 'supported') return { status: support };

  try {
    await getPreparedPushResources();
    return { status: 'prepared' };
  } catch (error) {
    return resourceFailureResult(error);
  }
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

/** Read the live browser subscription without requiring a VAPID request. */
export async function getLivePushSubscription(): Promise<PushSubscription | null> {
  const registration = await getPushRegistration();
  return registration.pushManager.getSubscription();
}

/**
 * The `Notification.requestPermission()` call is intentionally made before this function awaits
 * anything. Its invocation remains in the click call stack, which Safari/iOS requires.
 */
export function subscribe(): Promise<PushEnableResult> {
  if (!isBrowser()) return Promise.resolve({ status: 'unsupported' });

  const support = getPushSupport();
  if (support !== 'supported') return Promise.resolve({ status: support });

  const permission = Notification.permission;
  if (permission === 'denied') return Promise.resolve({ status: 'permission-denied' });

  if (permission === 'default') {
    let permissionRequest: Promise<NotificationPermission>;
    try {
      // Do not move this below an await, service-worker lookup, VAPID fetch, or timer.
      permissionRequest = Notification.requestPermission();
    } catch (error) {
      reportPushFailure('permission-request', error);
      return Promise.resolve({ status: 'permission-dismissed' });
    }
    return continueAfterPermissionRequest(permissionRequest);
  }

  return subscribeAfterPermissionGranted();
}

async function continueAfterPermissionRequest(
  permissionRequest: Promise<NotificationPermission>,
): Promise<PushEnableResult> {
  try {
    const permission = await permissionRequest;
    if (permission === 'denied') return { status: 'permission-denied' };
    if (permission !== 'granted') return { status: 'permission-dismissed' };
    return subscribeAfterPermissionGranted();
  } catch (error) {
    reportPushFailure('permission-request', error);
    return { status: 'permission-dismissed' };
  }
}

async function subscribeAfterPermissionGranted(): Promise<PushEnableResult> {
  let resources: PreparedPushResources;
  try {
    resources = await getPreparedPushResources();
  } catch (error) {
    return resourceFailureResult(error);
  }

  let subscription: PushSubscription;
  let createdSubscription = false;
  try {
    const existingSubscription = await resources.registration.pushManager.getSubscription();
    if (existingSubscription) {
      subscription = existingSubscription;
    } else {
      subscription = await resources.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(resources.vapidPublicKey) as BufferSource,
      });
      createdSubscription = true;
    }
  } catch (error) {
    reportPushFailure('browser-subscription', error);
    return { status: 'browser-subscribe-failed' };
  }

  let body: ReturnType<typeof subscriptionToRequestBody>;
  try {
    body = subscriptionToRequestBody(subscription, navigator.userAgent);
  } catch (error) {
    reportPushFailure('subscription-payload', error);
    return { status: 'browser-subscribe-failed' };
  }

  try {
    const { error } = await apiClient.POST('/v1/push/subscriptions', { body });
    if (error) throw new Error('Push subscription registration was rejected');
  } catch (error) {
    reportPushFailure('backend-registration', error);
    if (createdSubscription) {
      try {
        await subscription.unsubscribe();
      } catch (unsubscribeError) {
        reportPushFailure('browser-subscription-rollback', unsubscribeError);
      }
    }
    return { status: 'backend-registration-failed' };
  }

  localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, body.endpoint);
  return { status: 'enabled' };
}

/** Backend failure must not block the local unsubscribe (offline-tolerant). */
export async function unsubscribe(): Promise<void> {
  if (!isBrowser()) return;

  try {
    const registration = await getPushRegistration();
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

async function reconcile(): Promise<void> {
  if (!isBrowser() || getPushSupport() !== 'supported') return;
  if (Notification.permission !== 'granted') return;

  try {
    const subscription = await getLivePushSubscription();
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
  } catch (error) {
    // Best-effort — lifecycle refreshes and the next authenticated launch retry this safely.
    reportPushFailure('reconciliation', error);
  }
}

/** Prevent overlapping launch/foreground reconciliations. */
export function reconcileOnLaunch(): Promise<void> {
  if (reconciliationPromise) return reconciliationPromise;

  const pending = reconcile();
  reconciliationPromise = pending;
  void pending.finally(() => {
    if (reconciliationPromise === pending) reconciliationPromise = undefined;
  });
  return pending;
}

/** @internal Test reset for module-level resource caches. */
export function resetPushNotificationStateForTesting(): void {
  capturedRegistration = undefined;
  preparationPromise = undefined;
  reconciliationPromise = undefined;
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
