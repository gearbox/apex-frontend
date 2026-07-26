import { resetQueryCache } from '$lib/queries/queryClient';
import { clearBlobCache } from '$lib/media/save/blobCache';
import { CONTENT_MEDIA_CACHE_NAME } from '$lib/pwa/contentCachePolicy';
import { activeProject } from '$lib/stores/activeProject.svelte';
import { activeJobStore } from '$lib/stores/jobs';
import { generationStore } from '$lib/stores/generation';
import { dismissAllCreditWarnings } from '$lib/stores/creditWarnings';
import { clearToasts } from '$lib/stores/toasts';
import { isBrowser } from '$lib/utils/env';

/**
 * Clears every module-level cache/store that could otherwise carry one account's data into the
 * next session on the same tab (the TanStack query cache, the in-progress generation draft, GPU
 * credit warnings, queued toasts, the save/share blob cache, and the SW's content-media cache).
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
    purgeContentMediaCache,
  ];

  for (const step of steps) {
    try {
      step();
    } catch {
      // A single step's failure must not block the rest of the reset.
    }
  }
}

/** Content-proxy responses are private to the account that fetched them. Deliberately not
 *  awaited — dead-session handling must remain synchronous and resilient to cache errors. */
function purgeContentMediaCache(): void {
  if (isBrowser() && typeof caches !== 'undefined') {
    void caches.delete(CONTENT_MEDIA_CACHE_NAME).catch(() => undefined);
  }
}
