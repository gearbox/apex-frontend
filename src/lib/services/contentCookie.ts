import { onlineManager } from '@tanstack/svelte-query';
import { isBrowser } from '$lib/utils/env';
import { remintContentCookie, silentRefresh } from '$lib/api/auth';
import { getContentCookieExpiresAt } from '$lib/stores/auth';

/** Floor so a near-expiry (or clock-skewed) value can never busy-loop the re-mint timer. */
export const MIN_REMINT_INTERVAL_MS = 5 * 60 * 1000;
/** Re-mint proactively well before the cookie lapses — see BACKEND_API_REFERENCE.md §2. */
export const REMINT_LIFETIME_FRACTION = 0.75;

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let onVisibilityChange: (() => void) | undefined;
let onPageShow: (() => void) | undefined;

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

function clearTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

function scheduleNext(expiresAt: Date): void {
  clearTimer();
  if (!started) return;
  timer = setTimeout(() => void runCycle(), msUntilNextRemint(expiresAt));
}

/**
 * One keep-alive cycle: try the cheap re-mint first; only escalate to a full refresh if that
 * fails. If the refresh also fails, stop scheduling entirely rather than retrying — a definitive
 * failure means silentRefresh() has already called clearAuth() (see auth.ts), and the
 * authenticated layout's own effect calls stop() once it observes the resulting unauthenticated
 * status. Retrying here would just be more of the "pure noise" B3 already avoids in the media
 * ladder.
 */
async function runCycle(): Promise<void> {
  const expiresAt = await remintContentCookie();
  if (expiresAt) {
    scheduleNext(expiresAt);
    return;
  }

  const result = await silentRefresh();
  if (!result.ok) return;

  const refreshedExpiry = getContentCookieExpiresAt();
  if (refreshedExpiry) scheduleNext(refreshedExpiry);
}

/**
 * Resume check (C5): if the stored expiry is already due, re-mint/refresh immediately — and
 * pause TanStack Query's own reconnect-triggered refetching for the duration of that check. The
 * SW's content-media cache is keyed by URL and survives until clearAuth() runs; if a revocation
 * landed while this device was suspended, a resume must not let an already-mounted Library grid
 * repaint from that (or the query) cache before clearAuth() → resetAppState() has purged both.
 * Toggling `onlineManager` only affects TanStack's own reconnect refetch — it does not touch
 * `navigator.onLine` or the app's OfflineBanner/network store.
 */
async function checkOnResume(): Promise<void> {
  if (!started) return;
  if (!isDueForRemint(getContentCookieExpiresAt())) return;

  const wasOnline = onlineManager.isOnline();
  onlineManager.setOnline(false);
  try {
    await runCycle();
  } finally {
    onlineManager.setOnline(wasOnline);
  }
}

/** Starts the keep-alive. No-ops if already started or outside the browser. Not auto-run on import. */
export function start(): void {
  if (!isBrowser() || started) return;
  started = true;

  const expiresAt = getContentCookieExpiresAt();
  if (expiresAt && !isDueForRemint(expiresAt)) {
    scheduleNext(expiresAt);
  } else {
    void runCycle();
  }

  onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void checkOnResume();
  };
  onPageShow = () => void checkOnResume();
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
}

/** Stops the keep-alive and clears every timer/listener. Safe to call when not started. */
export function stop(): void {
  started = false;
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
}
