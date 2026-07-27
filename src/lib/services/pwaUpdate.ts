import { writable } from 'svelte/store';
import { BUILD_SHA, APP_VERSION } from '$lib/utils/appVersion';
import { isBrowser } from '$lib/utils/env';
import { isStandalone } from '$lib/utils/platform';
import { isAppDirty } from '$lib/services/appDirty';
import {
  PWA_ACTIVATE_UPDATE,
  PWA_GET_BUILD_INFO,
  isPwaWorkerToClientMessage,
} from '$lib/pwa/protocol';

export type PwaUpdateState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready-to-activate'
  | 'activating'
  | 'reload-required'
  | 'up-to-date'
  | 'offline'
  | 'failed';

export type UpdateCheckSource =
  | 'startup'
  | 'visibility'
  | 'pageshow'
  | 'online'
  | 'interval'
  | 'manual'
  | 'backend-event';

export interface AppVersionManifest {
  version: string;
  buildSha: string;
  builtAt: string;
}

export type PwaUpdateError =
  | 'network'
  | 'timeout'
  | 'invalid-manifest'
  | 'registration-update'
  | 'worker-installation'
  | 'worker-redundant'
  | 'worker-activation-timeout'
  | 'worker-build-mismatch';

export interface PwaUpdateSnapshot {
  state: PwaUpdateState;
  source?: UpdateCheckSource;
  targetBuildSha?: string;
  targetVersion?: string;
  dismissed: boolean;
  error?: PwaUpdateError;
}

export type UpdateCheckStatus =
  | 'up-to-date'
  | 'update-available'
  | 'offline'
  | 'failed'
  | 'registration-unavailable'
  | 'skipped-cooldown';

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  source: UpdateCheckSource;
  remote?: AppVersionManifest;
}

export interface RemoteAppUpdateEvent {
  targetBuildSha?: string;
  minimumVersion?: string;
  /** `force` is reserved for a future mandatory-update policy; it never bypasses draft safety. */
  mode?: 'prompt' | 'force';
}

type ReconcileContext =
  | 'registration'
  | 'updatefound'
  | 'worker-state'
  | 'registration-update'
  | 'controllerchange'
  | 'resume'
  | 'activation-timeout'
  | 'manual';

interface WorkerReferences {
  installing: ServiceWorker | null;
  waiting: ServiceWorker | null;
  active: ServiceWorker | null;
  controller: ServiceWorker | null;
}

const MANIFEST_URL = '/app-version.json';
const MANIFEST_TIMEOUT_MS = 8_000;
const WORKER_BUILD_INFO_TIMEOUT_MS = 1_500;
const ACTIVATION_TIMEOUT_MS = 12_000;
const CHECK_COOLDOWN_MS = 60_000;
const CHECK_INTERVAL_MS = 30 * 60 * 1_000;
const RELOAD_GUARD_PREFIX = 'apex:pwa-reloaded-for:';
const DISMISSED_PROMPT_PREFIX = 'apex:pwa-update-dismissed:';

const INITIAL_SNAPSHOT: PwaUpdateSnapshot = { state: 'idle', dismissed: false };

/** Reactive state for both the update prompt and the Profile recovery action. */
export const pwaUpdateStatus = writable<PwaUpdateSnapshot>(INITIAL_SNAPSHOT);

let activeRegistration: ServiceWorkerRegistration | undefined;
let inFlightCheck: Promise<UpdateCheckResult> | undefined;
let activationInFlight: Promise<boolean> | undefined;
let lastSuccessfulCheckAt = 0;
let targetBuildSha: string | undefined;
let reloadInitiated = false;
let controllerChangedBeforeTarget = false;
let lifecycleCleanups: Array<() => void> = [];
let registrationCleanups: Array<() => void> = [];
let observedWorkers = new WeakSet<ServiceWorker>();
let reloadPage = () => window.location.reload();
let lastRemoteEventFingerprint: string | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidBuildSha(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && /^[a-zA-Z0-9._-]+$/.test(value.trim())
  );
}

export function isUsableBuildSha(value: unknown): value is string {
  return isValidBuildSha(value) && value.trim().toLowerCase() !== 'dev';
}

/** Strictly validates the untrusted, public build-version response. */
export function parseAppVersionManifest(value: unknown): AppVersionManifest | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.version !== 'string' ||
    value.version.trim().length === 0 ||
    !isValidBuildSha(value.buildSha) ||
    typeof value.builtAt !== 'string' ||
    Number.isNaN(Date.parse(value.builtAt))
  ) {
    return null;
  }

  return {
    version: value.version.trim(),
    buildSha: value.buildSha.trim(),
    builtAt: value.builtAt,
  };
}

/** Build SHA is the identity; semantic version is presentation metadata only. */
export function compareBuildShas(
  currentBuildSha: string,
  remoteBuildSha: string,
): 'current' | 'update-available' | 'unavailable' {
  if (!isUsableBuildSha(currentBuildSha) || !isUsableBuildSha(remoteBuildSha)) {
    return 'unavailable';
  }
  return currentBuildSha === remoteBuildSha ? 'current' : 'update-available';
}

function report(event: string, fields: Record<string, unknown> = {}): void {
  // Lifecycle diagnostics intentionally contain build/state metadata only.
  console.info('[pwa_update]', event, {
    ...fields,
    currentVersion: APP_VERSION,
    currentBuildSha: BUILD_SHA,
    standalone: isBrowser() ? isStandalone() : false,
    visibility: isBrowser() ? document.visibilityState : 'server',
    online: isBrowser() ? navigator.onLine : false,
  });
}

function updateSnapshot(next: Partial<PwaUpdateSnapshot>): void {
  pwaUpdateStatus.update((current) => ({ ...current, ...next }));
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage is an optional reload-loop guard, not a hard dependency.
  }
}

function clearStaleSessionGuards(currentTarget: string): void {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (
        key &&
        (key.startsWith(RELOAD_GUARD_PREFIX) || key.startsWith(DISMISSED_PROMPT_PREFIX)) &&
        key !== `${RELOAD_GUARD_PREFIX}${currentTarget}` &&
        key !== `${DISMISSED_PROMPT_PREFIX}${currentTarget}`
      ) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage failures must not stop a recoverable update flow.
  }
}

function isPromptDismissed(buildSha: string | undefined): boolean {
  return Boolean(buildSha && readSession(`${DISMISSED_PROMPT_PREFIX}${buildSha}`));
}

function hasNavigatorServiceWorker(): boolean {
  return isBrowser() && 'serviceWorker' in navigator;
}

function isOffline(): boolean {
  return isBrowser() && navigator.onLine === false;
}

function workerReferences(registration: ServiceWorkerRegistration): WorkerReferences {
  return {
    installing: registration.installing,
    waiting: registration.waiting,
    active: registration.active,
    controller: hasNavigatorServiceWorker() ? navigator.serviceWorker.controller : null,
  };
}

/** A bounded handshake; older workers are intentionally treated as unknown. */
export function getWorkerBuildSha(worker: ServiceWorker | null): Promise<string | undefined> {
  if (
    !worker ||
    typeof worker.postMessage !== 'function' ||
    typeof MessageChannel === 'undefined'
  ) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (buildSha: string | undefined) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      channel.port1.close();
      resolve(buildSha);
    };
    const timeout = globalThis.setTimeout(() => finish(undefined), WORKER_BUILD_INFO_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      finish(isPwaWorkerToClientMessage(event.data) ? event.data.buildSha : undefined);
    };

    try {
      worker.postMessage({ type: PWA_GET_BUILD_INFO }, [channel.port2]);
    } catch {
      finish(undefined);
    }
  });
}

export async function fetchAppVersionManifest(): Promise<AppVersionManifest> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

  try {
    let response: Response;
    try {
      response = await Promise.race([
        fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = globalThis.setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new PwaUpdateRequestError('timeout'));
          }, MANIFEST_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      if (timedOut) throw new PwaUpdateRequestError('timeout');
      throw new PwaUpdateRequestError('network', error);
    }
    if (!response.ok) throw new PwaUpdateRequestError('network');

    try {
      const manifest = parseAppVersionManifest(await response.json());
      if (!manifest) throw new PwaUpdateRequestError('invalid-manifest');
      return manifest;
    } catch (error) {
      if (error instanceof PwaUpdateRequestError) throw error;
      throw new PwaUpdateRequestError('invalid-manifest', error);
    }
  } catch (error) {
    if (timedOut) throw new PwaUpdateRequestError('timeout');
    if (error instanceof PwaUpdateRequestError) throw error;
    throw new PwaUpdateRequestError('invalid-manifest', error);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
}

class PwaUpdateRequestError extends Error {
  constructor(
    readonly kind: 'network' | 'timeout' | 'invalid-manifest',
    cause?: unknown,
  ) {
    super(kind, { cause });
    this.name = 'PwaUpdateRequestError';
  }
}

function setWorkerFailure(error: Extract<PwaUpdateError, `worker-${string}`>): void {
  updateSnapshot({
    state: 'failed',
    error,
    targetBuildSha,
    dismissed: isPromptDismissed(targetBuildSha),
  });
  report('pwa_update.worker_failed', { error, targetBuildSha });
}

function listenForWorkerStateChanges(worker: ServiceWorker): void {
  if (observedWorkers.has(worker)) return;
  observedWorkers.add(worker);

  const listener = () => {
    report('pwa_update.worker_state_changed', { workerState: worker.state });
    if (worker.state === 'installing') {
      updateSnapshot({
        state: 'downloading',
        targetBuildSha,
        dismissed: isPromptDismissed(targetBuildSha),
      });
    } else if (worker.state === 'redundant') {
      setWorkerFailure('worker-redundant');
    } else if (worker.state === 'activated') {
      void reconcileRegistration(activeRegistration, 'worker-state');
    } else if (worker.state === 'installed' || worker.state === 'activating') {
      void reconcileRegistration(activeRegistration, 'worker-state');
    }
  };

  worker.addEventListener('statechange', listener);
  registrationCleanups.push(() => {
    worker.removeEventListener('statechange', listener);
    observedWorkers.delete(worker);
  });
}

async function controllerMatchesTarget(target: string): Promise<boolean> {
  if (!hasNavigatorServiceWorker()) return false;
  const controller = navigator.serviceWorker.controller;
  return (await getWorkerBuildSha(controller)) === target;
}

/**
 * Reload is permitted only after the page's controller is confirmed to be the
 * target worker. The narrow unknown-worker escape hatch is for an observed
 * controllerchange that beat the manifest response on old workers.
 */
async function reloadAfterControllerChange(
  force = false,
  allowEarlyUnknownController = false,
): Promise<boolean> {
  const target = targetBuildSha;
  if (!target || !isUsableBuildSha(target) || !hasNavigatorServiceWorker()) return false;

  const controller = navigator.serviceWorker.controller;
  const controllerBuildSha = await getWorkerBuildSha(controller);
  const confirmed = controllerBuildSha === target;
  const guardedUnknownRecovery =
    allowEarlyUnknownController &&
    controllerChangedBeforeTarget &&
    controller !== null &&
    controllerBuildSha === undefined;

  if (!confirmed && !guardedUnknownRecovery) {
    report('pwa_update.reload_waiting_for_expected_controller', { targetBuildSha: target });
    return false;
  }

  clearStaleSessionGuards(target);
  updateSnapshot({
    state: 'reload-required',
    targetBuildSha: target,
    dismissed: isPromptDismissed(target),
    error: undefined,
  });

  if (isAppDirty() && !force) {
    report('pwa_update.reload_deferred_dirty', { targetBuildSha: target });
    return false;
  }

  const guardKey = `${RELOAD_GUARD_PREFIX}${target}`;
  if (readSession(guardKey)) {
    report('pwa_update.reload_skipped_session_guard', { targetBuildSha: target });
    return false;
  }
  if (reloadInitiated) return false;

  // The persisted guard is checked before the in-memory one and is written
  // immediately before the controlled reload, avoiding both loop variants.
  writeSession(guardKey, '1');
  reloadInitiated = true;
  report('pwa_update.reload_started', {
    targetBuildSha: target,
    recoveredEarlyControllerChange: guardedUnknownRecovery,
  });
  reloadPage();
  return true;
}

function canAutomaticallyActivate(target: string): boolean {
  return !isAppDirty() && !isPromptDismissed(target);
}

function waitForExpectedController(
  target: string,
  expectedWorker: ServiceWorker,
): Promise<boolean> {
  if (!hasNavigatorServiceWorker()) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (matched: boolean) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve(matched);
    };
    const inspect = async () => {
      const controller = navigator.serviceWorker.controller;
      if (controller === expectedWorker) {
        finish(true);
        return;
      }
      if ((await getWorkerBuildSha(controller)) === target) finish(true);
    };
    const onControllerChange = () => void inspect();
    const timeout = globalThis.setTimeout(() => finish(false), ACTIVATION_TIMEOUT_MS);

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    void inspect();
  });
}

async function activateWaitingWorker(force: boolean): Promise<boolean> {
  const registration = activeRegistration;
  const target = targetBuildSha;
  if (!registration || !target || !isUsableBuildSha(target)) return false;

  const waiting = registration.waiting;
  if (!waiting) return false;

  const waitingBuildSha = await getWorkerBuildSha(waiting);
  if (waitingBuildSha !== target) {
    setWorkerFailure('worker-build-mismatch');
    return false;
  }

  if (isAppDirty() && !force) {
    updateSnapshot({
      state: 'ready-to-activate',
      targetBuildSha: target,
      dismissed: isPromptDismissed(target),
    });
    report('pwa_update.activation_deferred_dirty', { targetBuildSha: target });
    return false;
  }

  if (activationInFlight !== undefined) return activationInFlight;

  activationInFlight = (async () => {
    updateSnapshot({
      state: 'activating',
      targetBuildSha: target,
      dismissed: isPromptDismissed(target),
    });
    report('pwa_update.activation_requested', { targetBuildSha: target });

    const controllerWait = waitForExpectedController(target, waiting);
    try {
      waiting.postMessage({ type: PWA_ACTIVATE_UPDATE, targetBuildSha: target });
    } catch {
      setWorkerFailure('worker-installation');
      return false;
    }

    if (await controllerWait) return reloadAfterControllerChange(force);

    // Safari can delay/miss lifecycle events. Re-read before declaring a
    // recoverable timeout instead of leaving the prompt disabled forever.
    await reconcileRegistration(registration, 'activation-timeout');
    if (await controllerMatchesTarget(target)) return reloadAfterControllerChange(force);
    setWorkerFailure('worker-activation-timeout');
    return false;
  })();

  try {
    return await activationInFlight;
  } finally {
    activationInFlight = undefined;
  }
}

/**
 * Reconciliation intentionally reads state rather than relying only on events:
 * a worker can have installed while a standalone PWA was suspended.
 */
export async function reconcileRegistration(
  registration = activeRegistration,
  context: ReconcileContext = 'manual',
): Promise<void> {
  if (!registration || registration !== activeRegistration) return;

  const workers = workerReferences(registration);
  for (const worker of [workers.installing, workers.waiting, workers.active, workers.controller]) {
    if (worker) listenForWorkerStateChanges(worker);
  }

  const target = targetBuildSha;
  if (!target) {
    if (workers.installing) updateSnapshot({ state: 'downloading', dismissed: false });
    return;
  }

  if (workers.installing) {
    updateSnapshot({
      state: 'downloading',
      targetBuildSha: target,
      dismissed: isPromptDismissed(target),
    });
  }

  if (workers.waiting) {
    const waitingBuildSha = await getWorkerBuildSha(workers.waiting);
    if (waitingBuildSha === target) {
      updateSnapshot({
        state: 'ready-to-activate',
        targetBuildSha: target,
        dismissed: isPromptDismissed(target),
        error: undefined,
      });
      report('pwa_update.waiting_worker_ready', { context, targetBuildSha: target });
      if (canAutomaticallyActivate(target)) void activateWaitingWorker(false);
      return;
    }
    if (waitingBuildSha !== undefined) {
      setWorkerFailure('worker-build-mismatch');
      return;
    }
    // A worker from an old release has no handshake. It must stay waiting;
    // unknown identity is never an excuse to force activation or reload.
    updateSnapshot({
      state: 'ready-to-activate',
      targetBuildSha: target,
      dismissed: isPromptDismissed(target),
    });
    return;
  }

  const controllerBuildSha = await getWorkerBuildSha(workers.controller);
  if (controllerBuildSha === target) {
    updateSnapshot({
      state: 'reload-required',
      targetBuildSha: target,
      dismissed: isPromptDismissed(target),
      error: undefined,
    });
    void reloadAfterControllerChange(false);
    return;
  }

  const activeBuildSha = await getWorkerBuildSha(workers.active);
  if (activeBuildSha === target) {
    // It has activated, but this page has not yet received control.
    updateSnapshot({
      state: 'activating',
      targetBuildSha: target,
      dismissed: isPromptDismissed(target),
    });
    return;
  }

  if (
    controllerChangedBeforeTarget &&
    workers.controller &&
    !workers.installing &&
    !workers.waiting &&
    controllerBuildSha === undefined
  ) {
    // This is the bounded migration/race fallback: only an actually observed
    // early controller change plus a successful registration reconciliation
    // can reach it. The target-scoped reload guard prevents a loop.
    updateSnapshot({
      state: 'reload-required',
      targetBuildSha: target,
      dismissed: isPromptDismissed(target),
    });
    void reloadAfterControllerChange(false, true);
  }
}

function attachRegistrationListeners(registration: ServiceWorkerRegistration): void {
  const onUpdateFound = () => {
    report('pwa_update.update_found');
    if (registration.installing) listenForWorkerStateChanges(registration.installing);
    void reconcileRegistration(registration, 'updatefound');
  };
  registration.addEventListener('updatefound', onUpdateFound);
  registrationCleanups.push(() => registration.removeEventListener('updatefound', onUpdateFound));
}

function attachLifecycleListeners(): void {
  if (!hasNavigatorServiceWorker() || lifecycleCleanups.length > 0) return;

  const check = (source: UpdateCheckSource) => {
    void reconcileRegistration(activeRegistration, 'resume');
    void checkForAppUpdate({ source }).catch(() => {});
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') check('visibility');
  };
  const onPageShow = () => check('pageshow');
  const onOnline = () => check('online');
  const onControllerChange = () => {
    if (!targetBuildSha) controllerChangedBeforeTarget = true;
    report('pwa_update.controller_changed', { targetBuildSha: targetBuildSha ?? 'unknown' });
    void reconcileRegistration(activeRegistration, 'controllerchange');
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('online', onOnline);
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  const interval = globalThis.setInterval(() => check('interval'), CHECK_INTERVAL_MS);

  lifecycleCleanups = [
    () => document.removeEventListener('visibilitychange', onVisibilityChange),
    () => window.removeEventListener('pageshow', onPageShow),
    () => window.removeEventListener('online', onOnline),
    () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange),
    () => globalThis.clearInterval(interval),
  ];
}

/** Called only by the existing PWA registration callback; it does not register a second worker. */
export function setPwaUpdateServiceWorkerRegistration(
  registration: ServiceWorkerRegistration,
): void {
  if (!isBrowser()) return;
  if (activeRegistration === registration) {
    void reconcileRegistration(registration, 'registration');
    return;
  }

  registrationCleanups.forEach((cleanup) => cleanup());
  registrationCleanups = [];
  observedWorkers = new WeakSet<ServiceWorker>();
  activeRegistration = registration;
  attachRegistrationListeners(registration);
  attachLifecycleListeners();
  report('pwa_update.registration_ready');
  void reconcileRegistration(registration, 'registration');
  void checkForAppUpdate({ source: 'startup' }).catch(() => {});
}

export function checkForAppUpdate(
  options: { force?: boolean; source?: UpdateCheckSource } = {},
): Promise<UpdateCheckResult> {
  const source = options.source ?? 'manual';
  if (!activeRegistration) return Promise.resolve({ status: 'registration-unavailable', source });

  if (inFlightCheck !== undefined) {
    report('pwa_update.check_deduplicated', { source });
    return inFlightCheck;
  }

  if (!options.force && Date.now() - lastSuccessfulCheckAt < CHECK_COOLDOWN_MS) {
    report('pwa_update.check_skipped_cooldown', { source });
    return Promise.resolve({ status: 'skipped-cooldown', source });
  }

  if (isOffline()) {
    updateSnapshot({ state: 'offline', source, error: undefined });
    return Promise.resolve({ status: 'offline', source });
  }

  const registration = activeRegistration;
  inFlightCheck = (async () => {
    const startedAt = Date.now();
    updateSnapshot({ state: 'checking', source, error: undefined });
    report('pwa_update.check_started', { source });

    try {
      const remote = await fetchAppVersionManifest();
      lastSuccessfulCheckAt = Date.now();
      const comparison = compareBuildShas(BUILD_SHA, remote.buildSha);

      if (comparison === 'update-available') {
        if (targetBuildSha !== remote.buildSha) reloadInitiated = false;
        targetBuildSha = remote.buildSha;
        clearStaleSessionGuards(remote.buildSha);
        updateSnapshot({
          state: 'checking',
          source,
          targetBuildSha: remote.buildSha,
          targetVersion: remote.version,
          dismissed: isPromptDismissed(remote.buildSha),
        });
        report('pwa_update.version_mismatch', { source, remoteBuildSha: remote.buildSha });
      } else {
        targetBuildSha = undefined;
        reloadInitiated = false;
        controllerChangedBeforeTarget = false;
        updateSnapshot({
          state: 'up-to-date',
          source,
          targetBuildSha: undefined,
          dismissed: false,
        });
      }

      if (comparison === 'update-available' || options.force) {
        try {
          await registration.update();
        } catch (error) {
          updateSnapshot({ state: 'failed', source, error: 'registration-update' });
          report('pwa_update.check_failed', {
            source,
            category: error instanceof Error ? error.name : 'UnknownError',
          });
          return { status: 'failed', source, remote };
        }
      }

      await reconcileRegistration(registration, 'registration-update');
      return {
        status: comparison === 'update-available' ? 'update-available' : 'up-to-date',
        source,
        remote,
      };
    } catch (error) {
      const kind = error instanceof PwaUpdateRequestError ? error.kind : 'network';
      const status: UpdateCheckStatus = isOffline() ? 'offline' : 'failed';
      updateSnapshot({
        state: status === 'offline' ? 'offline' : 'failed',
        source,
        error: status === 'offline' ? undefined : kind,
      });
      report('pwa_update.check_failed', {
        source,
        category: error instanceof Error ? error.name : 'UnknownError',
        elapsedMs: Date.now() - startedAt,
      });
      return { status, source };
    } finally {
      inFlightCheck = undefined;
    }
  })();

  return inFlightCheck;
}

/** User confirmation may bypass dirty state, never worker identity or sequencing. */
export async function applyPwaUpdate(): Promise<boolean> {
  if (!activeRegistration) return false;

  if (!targetBuildSha) {
    await checkForAppUpdate({ force: true, source: 'manual' });
  }
  const registration = activeRegistration;
  const target = targetBuildSha;
  if (!registration || !target) return false;

  await reconcileRegistration(registration, 'manual');
  if (await controllerMatchesTarget(target)) return reloadAfterControllerChange(true);
  if (registration.waiting) return activateWaitingWorker(true);

  try {
    await registration.update();
  } catch {
    updateSnapshot({ state: 'failed', error: 'registration-update' });
    return false;
  }
  await reconcileRegistration(registration, 'manual');
  if (await controllerMatchesTarget(target)) return reloadAfterControllerChange(true);
  if (registration.waiting) return activateWaitingWorker(true);

  // An installing worker is still recoverable and should remain actionable on
  // its next statechange; all other no-worker cases surface a retry state.
  if (registration.installing) {
    updateSnapshot({
      state: 'downloading',
      targetBuildSha: target,
      dismissed: isPromptDismissed(target),
    });
  } else {
    setWorkerFailure('worker-build-mismatch');
  }
  return false;
}

export function dismissPwaUpdatePrompt(): void {
  if (!targetBuildSha) return;
  writeSession(`${DISMISSED_PROMPT_PREFIX}${targetBuildSha}`, '1');
  updateSnapshot({ dismissed: true });
}

/** Integration seam for a future typed SSE/Web Push system event. */
export async function handleRemoteAppUpdateEvent(payload: RemoteAppUpdateEvent): Promise<void> {
  if (payload.targetBuildSha && payload.targetBuildSha === BUILD_SHA) return;
  const fingerprint = `${payload.targetBuildSha ?? ''}|${payload.minimumVersion ?? ''}|${payload.mode ?? 'prompt'}`;
  if (fingerprint === lastRemoteEventFingerprint) return;
  lastRemoteEventFingerprint = fingerprint;
  await checkForAppUpdate({ force: true, source: 'backend-event' });
}

/** Dispose root-layout lifecycle bindings. */
export function disposePwaUpdateService(): void {
  lifecycleCleanups.forEach((cleanup) => cleanup());
  lifecycleCleanups = [];
  registrationCleanups.forEach((cleanup) => cleanup());
  registrationCleanups = [];
  activeRegistration = undefined;
  inFlightCheck = undefined;
  activationInFlight = undefined;
  observedWorkers = new WeakSet<ServiceWorker>();
}

// Test-only hooks keep browser lifecycle tests deterministic under jsdom.
export function __resetPwaUpdateForTests(): void {
  disposePwaUpdateService();
  lastSuccessfulCheckAt = 0;
  targetBuildSha = undefined;
  reloadInitiated = false;
  controllerChangedBeforeTarget = false;
  lastRemoteEventFingerprint = undefined;
  reloadPage = () => window.location.reload();
  pwaUpdateStatus.set(INITIAL_SNAPSHOT);
}

export function __setPwaUpdateReloadForTests(reload: () => void): void {
  reloadPage = reload;
}
