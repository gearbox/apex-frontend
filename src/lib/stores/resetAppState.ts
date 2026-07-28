import { resetQueryCache } from '$lib/queries/queryClient';
import { clearBlobCache } from '$lib/media/save/blobCache';
import { activeProject } from '$lib/stores/activeProject.svelte';
import { activeJobStore } from '$lib/stores/jobs';
import { generationStore } from '$lib/stores/generation';
import { dismissAllCreditWarnings } from '$lib/stores/creditWarnings';
import { clearToasts } from '$lib/stores/toasts';
import { clearNotifications } from '$lib/stores/notifications';
import { setEventStreamStatus } from '$lib/stores/eventStream';
import { clearPersistedPushState } from '$lib/services/pushNotifications';
import { isBrowser } from '$lib/utils/env';
import { LEGACY_CONTENT_MEDIA_CACHE_NAME } from '$lib/utils/cacheNames';

/**
 * Clears every module-level cache/store that could otherwise carry one account's data into the
 * next session on the same tab (the TanStack query cache, the in-progress generation draft, GPU
 * credit warnings, queued toasts/notifications, the save/share blob cache, and event-stream
 * status). Persistent Workbox caching is intentionally not used for authenticated content.
 * Called from `clearAuth()` (every dead-session path) and once more after a fresh login/register
 * (see auth.ts) so isolation does not depend on how the previous session ended.
 *
 * Deliberately synchronous and exception-safe: `clearAuth()` runs on dead-session paths and must
 * complete without `await`, and one store's failure must never prevent the rest from resetting.
 */
export function resetAppState(): void {
  const steps: Array<() => void> = [
    resetQueryCache,
    clearBlobCache,
    () => activeProject.reset(),
    () => activeJobStore.clear(),
    () => generationStore.reset(),
    dismissAllCreditWarnings,
    clearToasts,
    clearNotifications,
    () => setEventStreamStatus('disconnected'),
    // Logout also clears these after its server detach. Keep this idempotent reset so every
    // session-ending path clears the previous account's markers, not just explicit logout.
    clearPersistedPushState,
    deleteLegacyContentMediaCache,
  ];

  for (const step of steps) {
    try {
      step();
    } catch {
      // A single step's failure must not block the rest of the reset.
    }
  }
}

/**
 * Covers the upgrade window where an old worker can still control the page before the new worker
 * activates. Keep this fire-and-forget so dead-session cleanup remains synchronous and resilient.
 */
function deleteLegacyContentMediaCache(): void {
  if (isBrowser() && typeof caches !== 'undefined') {
    void caches.delete(LEGACY_CONTENT_MEDIA_CACHE_NAME).catch(() => undefined);
  }
}
