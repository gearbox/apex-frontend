import { toMediaSrc } from '$lib/media/toMediaSrc';
import { fetchOriginalBlob } from './fetchOriginal';
import { getOrFetchBlob } from './blobCache';
import type { MediaObject } from './types';

/** Never speculatively pull a large video — only the click path should pay that cost. */
export const PREWARM_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Fire-and-forget cache warm, meant to run from `onpointerdown` on a Share/Download button —
 * before the click handler burns WebKit's transient-activation window on the network fetch.
 * Swallows all errors: a failed prewarm must be invisible, since the click path (`saveMedia`)
 * re-fetches and surfaces the real error if the asset still can't be retrieved.
 */
export function prewarmMedia(media: MediaObject): void {
  const { size_bytes } = media.original;
  if (size_bytes != null && size_bytes > PREWARM_MAX_BYTES) return;

  const cacheKey = toMediaSrc(media.original.url);
  getOrFetchBlob(
    cacheKey,
    () => fetchOriginalBlob(media),
    () => Date.now(),
  ).catch(() => {
    // Swallowed — see doc comment above.
  });
}
