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

  // The content proxy's GetObject-backed route sets Content-Type/Content-Length/Content-Range
  // together from a single R2 response, so a 200 can never arrive without Content-Length (see
  // BACKEND_API_REFERENCE.md §9, "Content Proxy performance & streaming"). The `status !== 200`
  // guard above already rejects 206 Partial Content and 304 Not Modified — this is a size check
  // on a full body, never a size-check-via-fetch of a response this cache shouldn't hold at all.
  const contentLength = response.headers.get('content-length');
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;
  const bytes = Number(contentLength);
  return Number.isSafeInteger(bytes) && bytes < CONTENT_MEDIA_MAX_BYTES;
}

interface ContentImageRouteMatchArgs {
  request: { destination: string };
  url: Pick<URL, 'origin' | 'pathname'>;
}

/**
 * Workbox route matcher: admits exactly `<img>`/`srcset` traffic against the authenticated
 * content proxy. `request.destination === 'image'` structurally excludes `<video>` Range
 * requests and every `fetch()`-based path (progressive original stream, save/share) — those
 * requests have an empty `destination` — so a `CacheFirst` strategy (which ignores `Range` when
 * matching) can never be asked to serve a request it was never meant to handle.
 */
export function matchesContentImageRoute(
  { request, url }: ContentImageRouteMatchArgs,
  apiOrigin: string,
): boolean {
  return (
    request.destination === 'image' &&
    url.origin === apiOrigin &&
    url.pathname.startsWith('/v1/content/')
  );
}
