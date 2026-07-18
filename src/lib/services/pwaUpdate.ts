import { writable } from 'svelte/store';
import { BUILD_SHA, APP_VERSION } from '$lib/utils/appVersion';
import { isBrowser } from '$lib/utils/env';
import { isStandalone } from '$lib/utils/platform';
import { isAppDirty } from '$lib/services/appDirty';

export type PwaUpdateState =
  | 'idle'
  | 'checking'
  | 'update-available'
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

export interface PwaUpdateSnapshot {
  state: PwaUpdateState;
  source?: UpdateCheckSource;
  targetBuildSha?: string;
  targetVersion?: string;
  dismissed: boolean;
  error?: 'network' | 'timeout' | 'invalid-manifest' | 'registration-update';
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
  /** `force` is reserved for a future mandatory-update policy; it never bypasses dirty-work protection. */
  mode?: 'prompt' | 'force';
}

const MANIFEST_URL = '/app-version.json';
const MANIFEST_TIMEOUT_MS = 8_000;
const CHECK_COOLDOWN_MS = 60_000;
const CHECK_INTERVAL_MS = 30 * 60 * 1_000;
const RELOAD_GUARD_PREFIX = 'apex:pwa-reloaded-for:';
const DISMISSED_PROMPT_PREFIX = 'apex:pwa-update-dismissed:';

const INITIAL_SNAPSHOT: PwaUpdateSnapshot = { state: 'idle', dismissed: false };

/** Reactive state for both the update prompt and the Profile recovery action. */
export const pwaUpdateStatus = writable<PwaUpdateSnapshot>(INITIAL_SNAPSHOT);

let activeRegistration: ServiceWorkerRegistration | undefined;
let inFlightCheck: Promise<UpdateCheckResult> | undefined;
let lastSuccessfulCheckAt = 0;
let targetBuildSha: string | undefined;
let reloadInitiated = false;
let lifecycleCleanups: Array<() => void> = [];
let registrationCleanups: Array<() => void> = [];
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
  // Keep this intentionally limited to safe build/lifecycle metadata. It must
  // never include URLs, auth data, user content, or exception messages.
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
    // Private browsing/storage restrictions must not block an update.
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
    // Storage is an optional reload-loop guard, not a hard dependency.
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

function workerStateChanged(worker: ServiceWorker): void {
  report('pwa_update.worker_state_changed', { workerState: worker.state });
  if (worker.state === 'installed') {
    updateSnapshot({ state: 'activating' });
  } else if (worker.state === 'activating') {
    updateSnapshot({ state: 'activating' });
  }
}

function listenForWorkerStateChanges(worker: ServiceWorker): void {
  const listener = () => workerStateChanged(worker);
  worker.addEventListener('statechange', listener);
  registrationCleanups.push(() => worker.removeEventListener('statechange', listener));
}

function reloadAfterControllerChange(force = false): boolean {
  const target = targetBuildSha;
  if (!target || !isUsableBuildSha(target)) return false;

  clearStaleSessionGuards(target);
  updateSnapshot({
    state: 'reload-required',
    targetBuildSha: target,
    dismissed: isPromptDismissed(target),
  });

  if (isAppDirty() && !force) {
    report('pwa_update.reload_deferred_dirty', { targetBuildSha: target });
    return false;
  }

  if (reloadInitiated) return false;
  reloadInitiated = true;

  const guardKey = `${RELOAD_GUARD_PREFIX}${target}`;
  if (readSession(guardKey)) {
    report('pwa_update.reload_skipped_session_guard', { targetBuildSha: target });
    return false;
  }

  writeSession(guardKey, '1');
  report('pwa_update.reload_started', { targetBuildSha: target });
  reloadPage();
  return true;
}

function handleControllerChange(): void {
  // controllerchange also fires when an app gets its very first service
  // worker. A confirmed remote target is required before a page is reloaded.
  if (!targetBuildSha) {
    report('pwa_update.controller_changed_ignored_initial');
    return;
  }

  report('pwa_update.controller_changed', { targetBuildSha });
  reloadAfterControllerChange();
}

function attachRegistrationListeners(registration: ServiceWorkerRegistration): void {
  const onUpdateFound = () => {
    report('pwa_update.update_found');
    updateSnapshot({ state: 'update-available' });
    if (registration.installing) listenForWorkerStateChanges(registration.installing);
  };
  registration.addEventListener('updatefound', onUpdateFound);
  registrationCleanups.push(() => registration.removeEventListener('updatefound', onUpdateFound));

  if (registration.installing) listenForWorkerStateChanges(registration.installing);
}

function attachLifecycleListeners(): void {
  if (!hasNavigatorServiceWorker() || lifecycleCleanups.length > 0) return;

  const check = (source: UpdateCheckSource) => {
    void checkForAppUpdate({ source }).catch(() => {});
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') check('visibility');
  };
  const onPageShow = () => check('pageshow');
  const onOnline = () => check('online');
  const onControllerChange = () => handleControllerChange();

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
  if (!isBrowser() || activeRegistration === registration) return;

  registrationCleanups.forEach((cleanup) => cleanup());
  registrationCleanups = [];
  activeRegistration = registration;
  attachRegistrationListeners(registration);
  attachLifecycleListeners();
  report('pwa_update.registration_ready');
  void checkForAppUpdate({ source: 'startup' }).catch(() => {});
}

export function checkForAppUpdate(
  options: { force?: boolean; source?: UpdateCheckSource } = {},
): Promise<UpdateCheckResult> {
  const source = options.source ?? 'manual';
  if (!activeRegistration) {
    return Promise.resolve({ status: 'registration-unavailable', source });
  }

  if (inFlightCheck) {
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

  inFlightCheck = (async () => {
    const startedAt = Date.now();
    updateSnapshot({ state: 'checking', source, error: undefined });
    report('pwa_update.check_started', { source });

    try {
      const remote = await fetchAppVersionManifest();
      lastSuccessfulCheckAt = Date.now();
      report('pwa_update.remote_version_loaded', {
        source,
        remoteVersion: remote.version,
        remoteBuildSha: remote.buildSha,
        elapsedMs: Date.now() - startedAt,
      });

      const comparison = compareBuildShas(BUILD_SHA, remote.buildSha);
      if (comparison === 'update-available') {
        targetBuildSha = remote.buildSha;
        reloadInitiated = false;
        clearStaleSessionGuards(remote.buildSha);
        updateSnapshot({
          state: 'update-available',
          source,
          targetBuildSha: remote.buildSha,
          targetVersion: remote.version,
          dismissed: isPromptDismissed(remote.buildSha),
        });
        report('pwa_update.version_mismatch', {
          source,
          remoteVersion: remote.version,
          remoteBuildSha: remote.buildSha,
        });
      } else {
        targetBuildSha = undefined;
        reloadInitiated = false;
        updateSnapshot({
          state: 'up-to-date',
          source,
          targetBuildSha: undefined,
          dismissed: false,
        });
      }

      // A forced/manual request deliberately asks the browser to check the
      // worker even if the manifest race reports the current build.
      if (comparison === 'update-available' || options.force) {
        report('pwa_update.registration_update_started', { source });
        try {
          await activeRegistration?.update();
        } catch (error) {
          updateSnapshot({ state: 'failed', source, error: 'registration-update' });
          report('pwa_update.check_failed', {
            source,
            category: error instanceof Error ? error.name : 'UnknownError',
          });
          return { status: 'failed', source, remote };
        }
      }

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

/** Apply a controller-confirmed update. `force` only means user-confirmed, never mandatory. */
export async function applyPwaUpdate(): Promise<boolean> {
  return reloadAfterControllerChange(true);
}

export function dismissPwaUpdatePrompt(): void {
  if (!targetBuildSha) return;
  writeSession(`${DISMISSED_PROMPT_PREFIX}${targetBuildSha}`, '1');
  updateSnapshot({ dismissed: true });
}

/**
 * Integration seam for a future typed SSE/Web Push system event. It shares
 * the normal fetch/update lifecycle and intentionally does not force reloads.
 */
export async function handleRemoteAppUpdateEvent(payload: RemoteAppUpdateEvent): Promise<void> {
  if (payload.targetBuildSha && payload.targetBuildSha === BUILD_SHA) return;
  const fingerprint = `${payload.targetBuildSha ?? ''}|${payload.minimumVersion ?? ''}|${payload.mode ?? 'prompt'}`;
  if (fingerprint === lastRemoteEventFingerprint) return;
  lastRemoteEventFingerprint = fingerprint;
  await checkForAppUpdate({ force: true, source: 'backend-event' });
}

/** Dispose page lifecycle bindings when the root application layout unmounts. */
export function disposePwaUpdateService(): void {
  lifecycleCleanups.forEach((cleanup) => cleanup());
  lifecycleCleanups = [];
  registrationCleanups.forEach((cleanup) => cleanup());
  registrationCleanups = [];
  activeRegistration = undefined;
  inFlightCheck = undefined;
}

// Test-only hooks keep production browser code simple while making the
// controllerchange/reload contract deterministic under jsdom.
export function __resetPwaUpdateForTests(): void {
  disposePwaUpdateService();
  lastSuccessfulCheckAt = 0;
  targetBuildSha = undefined;
  reloadInitiated = false;
  lastRemoteEventFingerprint = undefined;
  reloadPage = () => window.location.reload();
  pwaUpdateStatus.set(INITIAL_SNAPSHOT);
}

export function __setPwaUpdateReloadForTests(reload: () => void): void {
  reloadPage = reload;
}
