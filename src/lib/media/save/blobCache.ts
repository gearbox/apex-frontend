const TTL_MS = 60_000;
const MAX_ENTRIES = 2;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

interface CacheEntry {
  blob: Blob;
  storedAt: number;
}

/** Map insertion order doubles as LRU order (oldest first) — re-inserting a key on access
 *  or store bumps it to the most-recently-used end. */
const cache = new Map<string, CacheEntry>();

/** Concurrent callers for the same URL (e.g. a share-button prewarm racing the click) share
 *  one in-flight request instead of firing a second fetch. */
const inflight = new Map<string, Promise<Blob>>();

function totalBytes(): number {
  let total = 0;
  for (const entry of cache.values()) total += entry.blob.size;
  return total;
}

function evictToLimits(): void {
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  while (totalBytes() > MAX_TOTAL_BYTES && cache.size > 0) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

/** Bounds memory to a couple of assets at a time — videos can be large. */
export function getCachedBlob(url: string, now: number): Blob | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (now - entry.storedAt >= TTL_MS) {
    cache.delete(url);
    return null;
  }
  // Bump recency on read.
  cache.delete(url);
  cache.set(url, entry);
  return entry.blob;
}

export function setCachedBlob(url: string, blob: Blob, now: number): void {
  cache.delete(url);
  cache.set(url, { blob, storedAt: now });
  evictToLimits();
}

export function clearBlobCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Orchestrates a fetch: cache hit → shared in-flight promise → fresh fetch → store.
 * `now` is called once for the lookup and, on a miss, again after the fetch resolves — so a
 * slow fetch is stamped with its completion time, not the time the lookup started.
 */
export function getOrFetchBlob(
  url: string,
  fetcher: () => Promise<Blob>,
  now: () => number,
): Promise<Blob> {
  const cached = getCachedBlob(url, now());
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(url);
  if (pending) return pending;

  const request = fetcher()
    .then((blob) => {
      setCachedBlob(url, blob, now());
      return blob;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, request);
  return request;
}
