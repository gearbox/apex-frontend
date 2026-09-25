import { toMediaSrc } from '$lib/media/toMediaSrc';
import type { MediaObject } from './types';

/** A protected original's canonical in-memory blob-cache key, or null when it is not fetchable. */
export function protectedOriginalCacheKey(media: MediaObject): string | null {
  return toMediaSrc(media.original.url);
}
