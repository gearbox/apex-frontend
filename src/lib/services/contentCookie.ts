import { isBrowser } from '$lib/utils/env';
import { remintContentCookie, silentRefresh } from '$lib/api/auth';
import { getContentCookieExpiresAt } from '$lib/stores/auth';
import { getAuthEpoch, isAuthEpochCurrent } from '$lib/stores/authLifecycle';

/** Floor so a near-expiry (or clock-skewed) value can never busy-loop the re-mint timer. */
export const MIN_REMINT_INTERVAL_MS = 5 * 60 * 1000;
/** Re-mint proactively well before the cookie lapses — see BACKEND_API_REFERENCE.md §2. */
export const REMINT_LIFETIME_FRACTION = 0.75;
export const TRANSIENT_REMINT_RETRY_BASE_MS = 30 * 1000;
export const TRANSIENT_REMINT_RETRY_MAX_MS = 5 * 60 * 1000;

let started = false;
let serviceGeneration = 0;
let retryCount = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let onVisibilityChange: (() => void) | undefined;
let onPageShow: (() => void) | undefined;
let cycleFlight: { identity: CycleIdentity; promise: Promise<void> } | undefined;

interface CycleIdentity {
  serviceGeneration: number;
  authEpoch: number;
}

/** Exported for direct unit testing of the scheduling math. */
export function msUntilNextRemint(expiresAt: Date, now = Date.now()): number {
  const remainingMs = expiresAt.getTime() - now;
  return Math.max(remainingMs * REMINT_LIFETIME_FRACTION, MIN_REMINT_INTERVAL_MS);
}

/** True when the stored expiry is missing, already past, or within the busy-loop floor. */
export function isDueForRemint(expiresAt: Date | null, now = Date.now()): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - now <= MIN_REMINT_INTERVAL_MS;
}

function isCurrent(identity: CycleIdentity): boolean {
  return (
    started &&
    serviceGeneration === identity.serviceGeneration &&
    isAuthEpochCurrent(identity.authEpoch)
  );
}

function clearTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

function schedule(delayMs: number, identity: CycleIdentity): void {
  clearTimer();
  if (!isCurrent(identity)) return;
  timer = setTimeout(() => {
    timer = undefined;
    void runCycle(identity);
  }, delayMs);
}

function scheduleNext(expiresAt: Date, identity: CycleIdentity): void {
  retryCount = 0;
  schedule(msUntilNextRemint(expiresAt), identity);
}

function transientDelay(retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) {
    // Never retry earlier than the server permits. The floor also prevents a Retry-After: 0
    // response from turning a suspended/offline app into a busy loop.
    return Math.max(MIN_REMINT_INTERVAL_MS, retryAfterMs);
  }
  const exponential = Math.min(
    TRANSIENT_REMINT_RETRY_BASE_MS * 2 ** retryCount,
    TRANSIENT_REMINT_RETRY_MAX_MS,
  );
  retryCount += 1;
  // A small jitter avoids every thumbnail/PWA resuming at the exact same moment. Tests can use
  // fake timers without depending on its exact value.
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

function scheduleTransientRetry(identity: CycleIdentity, retryAfterMs?: number): void {
  schedule(transientDelay(retryAfterMs), identity);
}

/**
 * One epoch-bound keep-alive cycle.  It is globally single-flight so pageshow and visibilitychange
 * cannot interleave two snapshots or alter TanStack Query's global online state. We deliberately
 * do not touch onlineManager: its value belongs to the network observer, not this auth check.
 */
function runCycle(identity: CycleIdentity): Promise<void> {
  if (!isCurrent(identity)) return Promise.resolve();
  if (
    cycleFlight &&
    cycleFlight.identity.serviceGeneration === identity.serviceGeneration &&
    cycleFlight.identity.authEpoch === identity.authEpoch
  ) {
    return cycleFlight.promise;
  }

  const cycle = (async (): Promise<void> => {
    const remint = await remintContentCookie();
    if (!isCurrent(identity)) return;

    if (remint.kind === 'ok') {
      scheduleNext(remint.expiresAt, identity);
      return;
    }

    if (remint.kind === 'unauthorized') {
      const refreshed = await silentRefresh();
      if (!isCurrent(identity)) return;
      if (refreshed.ok) {
        const refreshedExpiry = getContentCookieExpiresAt();
        if (refreshedExpiry) scheduleNext(refreshedExpiry, identity);
        else scheduleTransientRetry(identity);
        return;
      }
      // Only a definitive refresh failure ends the session. Network failure is explicitly
      // non-terminal and gets another bounded keep-alive attempt.
      if (refreshed.reason === 'network') scheduleTransientRetry(identity);
      return;
    }

    if (remint.kind === 'rate_limited') {
      scheduleTransientRetry(identity, remint.retryAfterMs);
      return;
    }

    // `transient` is an outage/offline/5xx condition. `stale`/`aborted` are normally followed by
    // auth invalidation; isCurrent above already suppresses scheduling for that old session.
    if (remint.kind === 'transient') scheduleTransientRetry(identity);
  })();

  const promise = cycle.finally(() => {
    if (cycleFlight?.promise === promise) cycleFlight = undefined;
  });
  const flight = { identity, promise };
  cycleFlight = flight;
  return flight.promise;
}

function checkOnResume(): void {
  const identity = { serviceGeneration, authEpoch: getAuthEpoch() };
  if (!isCurrent(identity) || !isDueForRemint(getContentCookieExpiresAt())) return;
  void runCycle(identity);
}

/** Starts the keep-alive. No-ops if already started or outside the browser. Not auto-run on import. */
export function start(): void {
  if (!isBrowser() || started) return;
  started = true;
  const identity = { serviceGeneration, authEpoch: getAuthEpoch() };

  const expiresAt = getContentCookieExpiresAt();
  if (expiresAt && !isDueForRemint(expiresAt)) {
    scheduleNext(expiresAt, identity);
  } else {
    void runCycle(identity);
  }

  onVisibilityChange = () => {
    if (document.visibilityState === 'visible') checkOnResume();
  };
  onPageShow = () => checkOnResume();
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
}

/** Stops the keep-alive and clears every timer/listener. Safe to call when not started. */
export function stop(): void {
  // This invalidates continuations even before the layout effect has observed clearAuth().
  serviceGeneration += 1;
  started = false;
  retryCount = 0;
  clearTimer();
  if (isBrowser()) {
    if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange);
    if (onPageShow) window.removeEventListener('pageshow', onPageShow);
  }
  onVisibilityChange = undefined;
  onPageShow = undefined;
}

/** Test-only: resets module state between test files without a full module re-import. */
export function __resetContentCookieServiceForTesting(): void {
  stop();
  cycleFlight = undefined;
}
