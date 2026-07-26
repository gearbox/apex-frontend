import { toMediaSrc } from '$lib/media/toMediaSrc';
import { fetchOriginalBlob } from './fetchOriginal';
import { getOrFetchBlob } from './blobCache';
import type { MediaObject } from './types';

/** Never speculatively pull a large video — only the click path should pay that cost. */
export const PREWARM_MAX_BYTES = 64 * 1024 * 1024;

export interface PrewarmMediaOptions {
  signal?: AbortSignal;
  ttlMs?: number;
}

function isPrewarmEligible(media: MediaObject): boolean {
  const { size_bytes } = media.original;
  if (size_bytes != null && size_bytes > PREWARM_MAX_BYTES) return false;
  // Images with an unknown size remain eligible: image assets are bounded by the API's image
  // limits and are substantially less likely to create an unbounded speculative download.
  // Videos are not; require a known size before fetching their complete original blob.
  return media.media_type !== 'video' || size_bytes != null;
}

/**
 * Fire-and-forget cache warm, meant to run from `onpointerdown` on a Share/Download button —
 * before the click handler burns WebKit's transient-activation window on the network fetch.
 * Swallows all errors: a failed prewarm must be invisible, since the click path (`saveMedia`)
 * re-fetches and surfaces the real error if the asset still can't be retrieved.
 */
export function prewarmMedia(media: MediaObject): void {
  void prewarmMediaWithSignal(media).catch(() => {
    // Swallowed — see doc comment above.
  });
}

/**
 * Abortable form for viewer-stage warming. Its promise lets the owner explicitly absorb a
 * cancellation while preserving the normal fire-and-forget prewarm API for save controls.
 */
export async function prewarmMediaWithSignal(
  media: MediaObject,
  options: PrewarmMediaOptions = {},
): Promise<void> {
  if (!isPrewarmEligible(media)) return;

  const cacheKey = toMediaSrc(media.original.url);
  await getOrFetchBlob(
    cacheKey,
    // 'default' (not 'no-store') lets the streamed bytes populate the browser's HTTP disk cache —
    // the <video> element's own Range requests then reuse that entry instead of re-fetching the
    // full original on first open. This depends on the content proxy's Range support (206 Partial
    // Content + `Accept-Ranges: bytes` on every 200/206 — see BACKEND_API_REFERENCE.md §9,
    // "Content Proxy performance & streaming"): without it the browser couldn't serve a byte-range
    // straight from this cache entry and would re-request the whole file instead. Do not switch
    // this back to 'no-store', and do not reintroduce blob-swapping in MediaVideo (D2).
    (signal) => fetchOriginalBlob(media, signal, 'default'),
    () => Date.now(),
    { ttlMs: options.ttlMs, signal: options.signal },
  );
}
