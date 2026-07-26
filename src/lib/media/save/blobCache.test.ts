import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedBlob, setCachedBlob, clearBlobCache, getOrFetchBlob } from './blobCache';

beforeEach(() => {
  clearBlobCache();
});

describe('getCachedBlob / setCachedBlob', () => {
  it('returns null for a URL that was never stored', () => {
    expect(getCachedBlob('https://example.com/a', 0)).toBeNull();
  });

  it('returns the stored blob within the 60s TTL', () => {
    const blob = new Blob(['bytes']);
    setCachedBlob('https://example.com/a', blob, 0);
    expect(getCachedBlob('https://example.com/a', 59_999)).toBe(blob);
  });

  it('expires an entry once the TTL elapses', () => {
    const blob = new Blob(['bytes']);
    setCachedBlob('https://example.com/a', blob, 0);
    expect(getCachedBlob('https://example.com/a', 60_000)).toBeNull();
  });

  it('honors a longer per-entry TTL without changing the default TTL', () => {
    const blob = new Blob(['bytes']);
    setCachedBlob('https://example.com/viewer-video', blob, 0, { ttlMs: 5 * 60_000 });

    expect(getCachedBlob('https://example.com/viewer-video', 5 * 60_000 - 1)).toBe(blob);
    expect(getCachedBlob('https://example.com/viewer-video', 5 * 60_000)).toBeNull();
  });

  it('evicts the oldest entry once a third URL is stored at capacity 2', () => {
    setCachedBlob('https://example.com/a', new Blob(['a']), 0);
    setCachedBlob('https://example.com/b', new Blob(['b']), 1);
    setCachedBlob('https://example.com/c', new Blob(['c']), 2);

    expect(getCachedBlob('https://example.com/a', 2)).toBeNull();
    expect(getCachedBlob('https://example.com/b', 2)).not.toBeNull();
    expect(getCachedBlob('https://example.com/c', 2)).not.toBeNull();
  });

  it('reading an entry bumps its recency, saving it from the next eviction', () => {
    setCachedBlob('https://example.com/a', new Blob(['a']), 0);
    setCachedBlob('https://example.com/b', new Blob(['b']), 1);
    // Touch 'a' so 'b' becomes the least-recently-used entry.
    getCachedBlob('https://example.com/a', 1);
    setCachedBlob('https://example.com/c', new Blob(['c']), 2);

    expect(getCachedBlob('https://example.com/b', 2)).toBeNull();
    expect(getCachedBlob('https://example.com/a', 2)).not.toBeNull();
    expect(getCachedBlob('https://example.com/c', 2)).not.toBeNull();
  });

  it('evicts the oldest entry once the total-bytes cap (256 MB) is exceeded', () => {
    const big = (size: number) => ({ size }) as Blob;
    setCachedBlob('https://example.com/a', big(200 * 1024 * 1024), 0);
    setCachedBlob('https://example.com/b', big(200 * 1024 * 1024), 1);

    // Two 200 MB entries (400 MB) exceed the 256 MB cap, even though capacity-2 alone
    // would have allowed both to stay.
    expect(getCachedBlob('https://example.com/a', 1)).toBeNull();
    expect(getCachedBlob('https://example.com/b', 1)).not.toBeNull();
  });

  it('clearBlobCache empties the cache', () => {
    setCachedBlob('https://example.com/a', new Blob(['a']), 0);
    clearBlobCache();
    expect(getCachedBlob('https://example.com/a', 0)).toBeNull();
  });
});

describe('getOrFetchBlob', () => {
  it('serves a cache hit without invoking the fetcher', async () => {
    const blob = new Blob(['a']);
    setCachedBlob('https://example.com/a', blob, 0);
    const fetcher = vi.fn();

    const result = await getOrFetchBlob('https://example.com/a', fetcher, () => 1_000);

    expect(result).toBe(blob);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches and stores on a miss, then serves the cache on a later call', async () => {
    const blob = new Blob(['a']);
    const fetcher = vi.fn().mockResolvedValue(blob);
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(30_000);

    const first = await getOrFetchBlob('https://example.com/a', fetcher, now);
    const second = await getOrFetchBlob('https://example.com/a', fetcher, now);

    expect(first).toBe(blob);
    expect(second).toBe(blob);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cached entry is outside the TTL', async () => {
    const blob = new Blob(['a']);
    const fetcher = vi.fn().mockResolvedValue(blob);
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(61_001);

    await getOrFetchBlob('https://example.com/a', fetcher, now);
    await getOrFetchBlob('https://example.com/a', fetcher, now);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('lets a save join a prewarm request without starting another fetch', async () => {
    const blob = new Blob(['a']);
    let resolveFetch: (blob: Blob) => void;
    const prewarmFetcher = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const saveFetcher = vi.fn().mockResolvedValue(new Blob(['unexpected']));

    const prewarm = getOrFetchBlob('https://example.com/a', prewarmFetcher, () => 0);
    const save = getOrFetchBlob('https://example.com/a', saveFetcher, () => 0);
    resolveFetch!(blob);

    await expect(Promise.all([prewarm, save])).resolves.toEqual([blob, blob]);
    expect(prewarmFetcher).toHaveBeenCalledTimes(1);
    expect(saveFetcher).not.toHaveBeenCalled();
  });

  it('fetches independently for different URLs', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Blob(['a']))
      .mockResolvedValueOnce(new Blob(['b']));

    await getOrFetchBlob('https://example.com/a', fetcher, () => 0);
    await getOrFetchBlob('https://example.com/b', fetcher, () => 0);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('a rejected fetch clears the in-flight entry so a retry can fetch again', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Blob(['a']));

    await expect(getOrFetchBlob('https://example.com/a', fetcher, () => 0)).rejects.toThrow(
      'network',
    );
    const result = await getOrFetchBlob('https://example.com/a', fetcher, () => 0);

    expect(result).toBeInstanceOf(Blob);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('passes its own internal signal to the fetcher, never a caller-supplied one', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Blob(['a']));
    const callerController = new AbortController();

    await getOrFetchBlob('https://example.com/a', fetcher, () => 0, {
      signal: callerController.signal,
    });

    const [signalPassedToFetcher] = fetcher.mock.calls[0] as [AbortSignal];
    expect(signalPassedToFetcher).not.toBe(callerController.signal);
    expect(signalPassedToFetcher).toBeInstanceOf(AbortSignal);
  });
});

describe('getOrFetchBlob — reference-counted cancellation', () => {
  /** A fetcher whose returned promise only settles when the internal signal it receives
   *  aborts (rejecting) or `resolve` is called manually (resolving). */
  function abortableFetcher() {
    let resolve!: (blob: Blob) => void;
    const promise = new Promise<Blob>((res) => {
      resolve = res;
    });
    const fetcher = vi.fn((signal: AbortSignal) => {
      return new Promise<Blob>((res, rej) => {
        signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
        promise.then(res, rej);
      });
    });
    return { fetcher, resolve };
  }

  it('rejects only the caller whose own signal aborted, leaving a second attached caller pending and eventually resolved', async () => {
    const { fetcher, resolve } = abortableFetcher();
    const controllerA = new AbortController();

    const callerA = getOrFetchBlob('https://example.com/a', fetcher, () => 0, {
      signal: controllerA.signal,
    });
    const callerB = getOrFetchBlob('https://example.com/a', fetcher, () => 0);

    controllerA.abort();
    await expect(callerA).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const blob = new Blob(['bytes']);
    resolve(blob);
    await expect(callerB).resolves.toBe(blob);
  });

  it('aborts the underlying fetch once the only attached caller aborts', async () => {
    const { fetcher } = abortableFetcher();
    const controller = new AbortController();

    const caller = getOrFetchBlob('https://example.com/solo', fetcher, () => 0, {
      signal: controller.signal,
    });
    const [internalSignal] = fetcher.mock.calls[0] as [AbortSignal];

    controller.abort();

    await expect(caller).rejects.toMatchObject({ name: 'AbortError' });
    expect(internalSignal.aborted).toBe(true);
  });

  it('starts a fresh fetch for a late joiner after the in-flight request was aborted', async () => {
    const { fetcher } = abortableFetcher();
    const controller = new AbortController();

    const caller = getOrFetchBlob('https://example.com/b', fetcher, () => 0, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(caller).rejects.toMatchObject({ name: 'AbortError' });

    const blob = new Blob(['fresh']);
    const secondFetcher = vi.fn().mockResolvedValue(blob);
    const result = await getOrFetchBlob('https://example.com/b', secondFetcher, () => 0);

    expect(result).toBe(blob);
    expect(secondFetcher).toHaveBeenCalledTimes(1);
  });

  it('a caller with no signal is a permanent attachment: it is unaffected by another caller aborting', async () => {
    const { fetcher, resolve } = abortableFetcher();
    const controllerA = new AbortController();

    const permanent = getOrFetchBlob('https://example.com/c', fetcher, () => 0);
    const abortable = getOrFetchBlob('https://example.com/c', fetcher, () => 0, {
      signal: controllerA.signal,
    });

    controllerA.abort();
    await expect(abortable).rejects.toMatchObject({ name: 'AbortError' });

    const blob = new Blob(['bytes']);
    resolve(blob);
    await expect(permanent).resolves.toBe(blob);
  });
});

describe('getOrFetchBlob — session reset isolation', () => {
  it('aborts the owned controller and never restores a blob when a late fetch ignores abort', async () => {
    let resolve!: (blob: Blob) => void;
    let internalSignal!: AbortSignal;
    const fetcher = vi.fn((signal: AbortSignal) => {
      internalSignal = signal;
      return new Promise<Blob>((done) => (resolve = done));
    });

    const pending = getOrFetchBlob('https://example.com/private-a', fetcher, () => 0);
    clearBlobCache();
    expect(internalSignal.aborted).toBe(true);
    resolve(new Blob(['A private bytes']));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(getCachedBlob('https://example.com/private-a', 1)).toBeNull();
  });

  it('settles every attached caller safely on reset and starts a new same-URL fetch independently', async () => {
    let resolveOld!: (blob: Blob) => void;
    const oldFetcher = vi.fn(() => new Promise<Blob>((done) => (resolveOld = done)));
    const first = getOrFetchBlob('https://example.com/private-a', oldFetcher, () => 0);
    const second = getOrFetchBlob('https://example.com/private-a', oldFetcher, () => 0);

    clearBlobCache();
    const freshBlob = new Blob(['B private bytes']);
    const newFetcher = vi.fn().mockResolvedValue(freshBlob);
    const fresh = getOrFetchBlob('https://example.com/private-a', newFetcher, () => 1);
    resolveOld(new Blob(['late A bytes']));

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    await expect(fresh).resolves.toBe(freshBlob);
    expect(oldFetcher).toHaveBeenCalledOnce();
    expect(newFetcher).toHaveBeenCalledOnce();
    expect(getCachedBlob('https://example.com/private-a', 2)).toBe(freshBlob);
  });
});
