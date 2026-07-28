const TTL_MS = 60_000;
const MAX_ENTRIES = 2;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

interface CacheEntry {
  blob: Blob;
  storedAt: number;
  ttlMs: number;
}

export interface BlobCacheOptions {
  /** Per-entry lifetime. Save/share behavior keeps the one-minute default. */
  ttlMs?: number;
  /** This caller's own cancellation. Omitting it makes this a permanent attachment (the
   *  save/share path) that rides the shared fetch to completion and can never be cancelled by
   *  another caller — e.g. a viewer prewarm — detaching first. */
  signal?: AbortSignal;
}

interface InflightEntry {
  promise: Promise<Blob>;
  controller: AbortController;
  liveCount: number;
  generation: number;
}

/** Map insertion order doubles as LRU order (oldest first) — re-inserting a key on access
 *  or store bumps it to the most-recently-used end. */
const cache = new Map<string, CacheEntry>();

/** Concurrent callers for the same URL (e.g. a share-button prewarm racing the click) share one
 *  in-flight request instead of firing a second fetch. Cancellation is reference-counted: the
 *  underlying fetch only aborts once every attached caller has detached, so one caller's abort
 *  (e.g. a viewer navigating away mid-warm) can never cancel another caller's save/share. */
const inflight = new Map<string, InflightEntry>();
/** Invalidating this synchronously makes even fetch mocks that ignore AbortSignal harmless. */
let cacheGeneration = 0;

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
  if (now - entry.storedAt >= entry.ttlMs) {
    cache.delete(url);
    return null;
  }
  // Bump recency on read.
  cache.delete(url);
  cache.set(url, entry);
  return entry.blob;
}

export function setCachedBlob(
  url: string,
  blob: Blob,
  now: number,
  options: BlobCacheOptions = {},
): void {
  cache.delete(url);
  cache.set(url, { blob, storedAt: now, ttlMs: options.ttlMs ?? TTL_MS });
  evictToLimits();
}

export function clearBlobCache(): void {
  cacheGeneration += 1;
  // Abort before dropping map ownership. Attached callers either observe the AbortError from a
  // compliant fetch or the generation check below when a mock/browser settles late.
  for (const entry of inflight.values()) entry.controller.abort();
  cache.clear();
  inflight.clear();
}

/**
 * Attaches one caller to a shared in-flight request. A caller with no `signal` rides the shared
 * promise to completion and is never individually cancelled. A caller with a `signal` gets its
 * own promise that rejects the instant its `signal` aborts — independent of whether the shared
 * fetch is still running — and detaches on either its own abort or the shared fetch settling.
 * The underlying fetch is aborted only once every attached caller has detached.
 */
function attachCaller(entry: InflightEntry, signal?: AbortSignal): Promise<Blob> {
  entry.liveCount += 1;
  let detached = false;
  const detach = () => {
    if (detached) return;
    detached = true;
    entry.liveCount -= 1;
    if (entry.liveCount <= 0) entry.controller.abort();
  };

  if (!signal) return entry.promise.finally(detach);

  if (signal.aborted) {
    detach();
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  return new Promise<Blob>((resolve, reject) => {
    const onAbort = () => {
      detach();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    entry.promise.then(
      (blob) => {
        signal.removeEventListener('abort', onAbort);
        detach();
        resolve(blob);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        detach();
        reject(error);
      },
    );
  });
}

/**
 * Orchestrates a fetch: cache hit → shared in-flight promise → fresh fetch → store.
 * `now` is called once for the lookup and, on a miss, again after the fetch resolves — so a
 * slow fetch is stamped with its completion time, not the time the lookup started.
 *
 * `getOrFetchBlob` owns the in-flight request: it creates its own `AbortController` and passes
 * that controller's signal to `fetcher`, never a caller's. `options.signal`, if given, only
 * governs this caller's *attachment* to the shared request (see `attachCaller`) — it can never
 * unilaterally cancel the underlying fetch out from under a differently-attached caller.
 */
export function getOrFetchBlob(
  url: string,
  fetcher: (signal: AbortSignal) => Promise<Blob>,
  now: () => number,
  options: BlobCacheOptions = {},
): Promise<Blob> {
  const cached = getCachedBlob(url, now());
  if (cached) return Promise.resolve(cached);

  let entry = inflight.get(url);
  if (!entry) {
    const controller = new AbortController();
    const generation = cacheGeneration;
    const created: InflightEntry = {
      controller,
      liveCount: 0,
      generation,
      promise: fetcher(controller.signal).then((blob) => {
        // A fetch implementation is permitted to settle after abort. Never allow that late value
        // to repopulate a cache that was reset for logout/account replacement.
        if (generation !== cacheGeneration || controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        setCachedBlob(url, blob, now(), options);
        return blob;
      }),
    };
    // Chained after construction so the cleanup callback (which only runs once the fetch has
    // already settled) can safely reference the now fully-built `created` entry.
    created.promise = created.promise.finally(() => {
      if (inflight.get(url) === created) inflight.delete(url);
    });
    entry = created;
    inflight.set(url, entry);
  }

  return attachCaller(entry, options.signal);
}
