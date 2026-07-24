/** Persistent private-content cache policy shared by the service worker and unit tests. */
export const CONTENT_MEDIA_CACHE_NAME = 'content-media-cache';
export const CONTENT_MEDIA_MAX_BYTES = 2 * 1024 * 1024;
export const CONTENT_MEDIA_MAX_ENTRIES = 600;
export const CONTENT_MEDIA_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Workbox must only persist successful, small image variants — never videos, originals, or errors. */
export function shouldCacheContentMedia(response: Response): boolean {
  if (response.type === 'opaque' || response.status !== 200) return false;

  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (!contentType?.startsWith('image/')) return false;

  const contentLength = response.headers.get('content-length');
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;
  const bytes = Number(contentLength);
  return Number.isSafeInteger(bytes) && bytes < CONTENT_MEDIA_MAX_BYTES;
}
