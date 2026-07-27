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

export type PushDisableStatus =
  | 'disabled'
  | 'service-worker-unavailable'
  | 'browser-unsubscribe-failed'
  | 'unsupported';

export interface PushDisableResult {
  status: PushDisableStatus;
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

/** A browser endpoint is confirmed only for the user who last registered it with the API. */
export interface StoredPushRegistration {
  version: 1;
  endpoint: string;
  userId: string;
}

interface StoredPushPromptState {
  version: 1;
  users: Record<string, PushPromptPreference>;
}

export interface PushPromptPreference {
  dismissed: boolean;
  retryPending: boolean;
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
const reconciliationPromises = new Map<string, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pure parser so corrupted storage can never break push initialization. */
export function parseStoredPushRegistration(raw: string | null): StoredPushRegistration | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.endpoint !== 'string' ||
      !value.endpoint ||
      typeof value.userId !== 'string' ||
      !value.userId
    ) {
      return null;
    }
    return { version: 1, endpoint: value.endpoint, userId: value.userId };
  } catch {
    return null;
  }
}

function parseStoredPushPromptState(raw: string | null): StoredPushPromptState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.users)) return null;

    const users: Record<string, PushPromptPreference> = {};
    for (const [userId, preference] of Object.entries(value.users)) {
      if (
        !userId ||
        !isRecord(preference) ||
        typeof preference.dismissed !== 'boolean' ||
        typeof preference.retryPending !== 'boolean'
      ) {
        return null;
      }
      users[userId] = {
        dismissed: preference.dismissed,
        retryPending: preference.retryPending,
      };
    }
    return { version: 1, users };
  } catch {
    return null;
  }
}

function readStorage(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage can be disabled in private browsing; push should remain retryable.
  }
}

function writeStorage(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // A failed local marker means the UI remains conservatively off after a refresh.
  }
}

/** Read a valid, versioned registration and discard malformed data. */
export function readStoredPushRegistration(): StoredPushRegistration | null {
  const raw = readStorage(STORAGE_KEYS.PUSH_REGISTRATION);
  const registration = parseStoredPushRegistration(raw);
  if (raw !== null && !registration) removeStorage(STORAGE_KEYS.PUSH_REGISTRATION);
  return registration;
}

/** Persist the confirmed API registration before retiring the unscoped legacy marker. */
export function storePushRegistration(registration: StoredPushRegistration): void {
  writeStorage(STORAGE_KEYS.PUSH_REGISTRATION, JSON.stringify(registration));
  removeStorage(STORAGE_KEYS.PUSH_ENDPOINT);
}

export function clearStoredPushRegistration(): void {
  removeStorage(STORAGE_KEYS.PUSH_REGISTRATION);
}

export function getPushPromptPreference(userId: string): PushPromptPreference {
  const raw = readStorage(STORAGE_KEYS.PUSH_PROMPT_STATE);
  const state = parseStoredPushPromptState(raw);
  if (raw !== null && !state) removeStorage(STORAGE_KEYS.PUSH_PROMPT_STATE);
  // The old global dismissal must never suppress a different account's prompt.
  removeStorage(STORAGE_KEYS.PUSH_NUDGE_DISMISSED);
  return state?.users[userId] ?? { dismissed: false, retryPending: false };
}

export function updatePushPromptPreference(
  userId: string,
  updates: Partial<PushPromptPreference>,
): void {
  const raw = readStorage(STORAGE_KEYS.PUSH_PROMPT_STATE);
  const state = parseStoredPushPromptState(raw) ?? { version: 1 as const, users: {} };
  const current = state.users[userId] ?? { dismissed: false, retryPending: false };
  state.users[userId] = { ...current, ...updates };
  writeStorage(STORAGE_KEYS.PUSH_PROMPT_STATE, JSON.stringify(state));
  removeStorage(STORAGE_KEYS.PUSH_NUDGE_DISMISSED);
}

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

/** Logs only a stage and error category; never credentials, endpoints, or push keys. */
export function reportPushFailure(stage: string, error?: unknown): void {
  const category = error instanceof Error ? error.name : 'UnknownError';
  console.warn('[push] operation failed', { stage, category });
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

async function preparePushResourcesOnce(): Promise<PreparedPushResources> {
  return {
    registration: await getPushRegistration(),
    vapidPublicKey: await fetchVapidPublicKey(),
  };
}

function getPreparedPushResources(): Promise<PreparedPushResources> {
  if (preparationPromise !== undefined) return preparationPromise;

  const pending = preparePushResourcesOnce();
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

async function registerPushSubscription(
  subscription: PushSubscription,
  userId: string,
): Promise<void> {
  const body = subscriptionToRequestBody(subscription, navigator.userAgent);
  const { error } = await apiClient.POST('/v1/push/subscriptions', { body });
  if (error) throw new Error('Push subscription registration was rejected');
  storePushRegistration({ version: 1, endpoint: body.endpoint, userId });
}

async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await apiClient.DELETE('/v1/push/subscriptions', { body: { endpoint } });
  if (error) throw new Error('Push subscription deletion was rejected');
}

/** Read the live browser subscription without requiring a VAPID request. */
export async function getLivePushSubscription(): Promise<PushSubscription | null> {
  const registration = await getPushRegistration();
  return registration.pushManager.getSubscription();
}

/** True for only the failures that should keep a granted-permission retry nudge eligible. */
export function isRetryablePushEnableStatus(status: PushEnableStatus): boolean {
  return (
    status === 'service-worker-unavailable' ||
    status === 'vapid-unavailable' ||
    status === 'browser-subscribe-failed' ||
    status === 'backend-registration-failed'
  );
}

/**
 * The `Notification.requestPermission()` call is intentionally made before this function awaits
 * anything. Its invocation remains in the click call stack, which Safari/iOS requires.
 */
export function subscribe(userId: string): Promise<PushEnableResult> {
  if (!isBrowser() || !userId) return Promise.resolve({ status: 'unsupported' });

  const support = getPushSupport();
  if (support !== 'supported') return Promise.resolve({ status: support });

  const { permission } = Notification;
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
    return continueAfterPermissionRequest(permissionRequest, userId);
  }

  return subscribeAfterPermissionGranted(userId);
}

async function continueAfterPermissionRequest(
  permissionRequest: Promise<NotificationPermission>,
  userId: string,
): Promise<PushEnableResult> {
  try {
    const permission = await permissionRequest;
    if (permission === 'denied') return { status: 'permission-denied' };
    if (permission !== 'granted') return { status: 'permission-dismissed' };
    return subscribeAfterPermissionGranted(userId);
  } catch (error) {
    reportPushFailure('permission-request', error);
    return { status: 'permission-dismissed' };
  }
}

async function subscribeAfterPermissionGranted(userId: string): Promise<PushEnableResult> {
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

  try {
    await registerPushSubscription(subscription, userId);
  } catch (error) {
    // A matching old marker is never valid after the current registration request was rejected.
    clearStoredPushRegistration();
    reportPushFailure('backend-registration', error);
    if (createdSubscription) {
      try {
        const rolledBack = await subscription.unsubscribe();
        if (!rolledBack) reportPushFailure('browser-subscription-rollback-failed');
      } catch (unsubscribeError) {
        reportPushFailure('browser-subscription-rollback-failed', unsubscribeError);
      }
    }
    return { status: 'backend-registration-failed' };
  }

  return { status: 'enabled' };
}

/**
 * Local unsubscribe is authoritative for an explicit disable. Backend cleanup follows it only as
 * best effort, so a failed DELETE cannot resurrect an endpoint that no longer exists locally.
 */
export async function unsubscribe(userId: string): Promise<PushDisableResult> {
  if (!isBrowser() || !userId) return { status: 'unsupported' };

  const stored = readStoredPushRegistration();
  let subscription: PushSubscription | null;
  try {
    subscription = await getLivePushSubscription();
  } catch (error) {
    reportPushFailure('browser-subscription-read', error);
    return { status: 'service-worker-unavailable' };
  }

  if (subscription) {
    try {
      const removed = await subscription.unsubscribe();
      if (!removed) {
        reportPushFailure('browser-unsubscribe-failed');
        return { status: 'browser-unsubscribe-failed' };
      }
    } catch (error) {
      reportPushFailure('browser-unsubscribe-failed', error);
      return { status: 'browser-unsubscribe-failed' };
    }

    try {
      await deletePushSubscription(subscription.endpoint);
    } catch (error) {
      reportPushFailure('backend-delete-after-local-unsubscribe', error);
    }
    // The live endpoint is gone, so no account can retain a confirmed local marker for it.
    clearStoredPushRegistration();
    removeStorage(STORAGE_KEYS.PUSH_ENDPOINT);
    return { status: 'disabled' };
  }

  if (stored?.userId === userId) {
    try {
      await deletePushSubscription(stored.endpoint);
    } catch (error) {
      reportPushFailure('backend-delete-without-live-subscription', error);
    }
    clearStoredPushRegistration();
  }
  return { status: 'disabled' };
}

/** Detach an explicitly logged-out account before its access token is cleared. */
export async function detachPushOnLogout(userId: string): Promise<void> {
  if (!isBrowser() || !userId) return;

  const stored = readStoredPushRegistration();
  let subscription: PushSubscription | null = null;
  try {
    subscription = await getLivePushSubscription();
  } catch (error) {
    reportPushFailure('logout-browser-subscription-read', error);
  }

  const ownedRegistration = stored?.userId === userId ? stored : null;
  const liveEndpoint = subscription?.endpoint;
  const endpoints = [
    ...new Set(
      [liveEndpoint, ownedRegistration?.endpoint].filter(
        (endpoint): endpoint is string => typeof endpoint === 'string' && endpoint.length > 0,
      ),
    ),
  ];
  if (endpoints.length === 0) return;

  let liveEndpointDeleteFailed = false;
  for (const endpoint of endpoints) {
    try {
      await deletePushSubscription(endpoint);
    } catch (error) {
      reportPushFailure('logout-backend-detach', error);
      if (endpoint === liveEndpoint) liveEndpointDeleteFailed = true;
    }
  }

  // A successful live-endpoint delete detaches browser delivery even if an old marker was stale.
  if (!liveEndpointDeleteFailed) {
    if (ownedRegistration) clearStoredPushRegistration();
    return;
  }

  if (!subscription) {
    // There is no live browser delivery left to detach locally.
    if (ownedRegistration) clearStoredPushRegistration();
    return;
  }

  try {
    const removed = await subscription.unsubscribe();
    if (removed) {
      clearStoredPushRegistration();
      removeStorage(STORAGE_KEYS.PUSH_ENDPOINT);
    } else {
      reportPushFailure('logout-browser-unsubscribe-failed');
    }
  } catch (error) {
    reportPushFailure('logout-browser-unsubscribe-failed', error);
  }
}

async function reconcile(userId: string, forceRegistration: boolean): Promise<void> {
  if (!isBrowser() || getPushSupport() !== 'supported') return;
  if (Notification.permission !== 'granted') return;

  try {
    const subscription = await getLivePushSubscription();
    const stored = readStoredPushRegistration();

    if (!subscription) {
      if (stored?.userId === userId) {
        try {
          await deletePushSubscription(stored.endpoint);
        } catch (error) {
          reportPushFailure('reconciliation-stale-backend-delete', error);
        }
        clearStoredPushRegistration();
      }
      return;
    }

    // A matching endpoint for another account remains untrusted: upsert it for this account.
    if (
      !forceRegistration &&
      stored?.userId === userId &&
      stored.endpoint === subscription.endpoint
    ) {
      return;
    }

    await registerPushSubscription(subscription, userId);
  } catch (error) {
    // A failed upsert must never leave an old local success marker to be mistaken for confirmation.
    clearStoredPushRegistration();
    reportPushFailure('reconciliation', error);
  }
}

/** Prevent overlapping reconciliation for one account without allowing User A to suppress User B. */
export function reconcileOnLaunch(userId: string, forceRegistration = false): Promise<void> {
  const existing = reconciliationPromises.get(userId);
  if (existing !== undefined) return existing;

  const pending = reconcile(userId, forceRegistration);
  reconciliationPromises.set(userId, pending);
  void pending.then(
    () => {
      if (reconciliationPromises.get(userId) === pending) reconciliationPromises.delete(userId);
    },
    () => {
      if (reconciliationPromises.get(userId) === pending) reconciliationPromises.delete(userId);
    },
  );
  return pending;
}

/** @internal Test reset for module-level resource caches. */
export function resetPushNotificationStateForTesting(): void {
  capturedRegistration = undefined;
  preparationPromise = undefined;
  reconciliationPromises.clear();
}

/* ─── Contextual nudge eligibility (pure) ─── */

export interface PushNudgeEligibilityInput {
  support: PushSupport;
  permission: NotificationPermission;
  subscribed: boolean;
  dismissed: boolean;
  retryPending: boolean;
}

export function isPushNudgeEligible(input: PushNudgeEligibilityInput): boolean {
  return (
    input.support === 'supported' &&
    input.permission !== 'denied' &&
    !input.subscribed &&
    !input.dismissed &&
    (input.permission === 'default' || input.retryPending)
  );
}
