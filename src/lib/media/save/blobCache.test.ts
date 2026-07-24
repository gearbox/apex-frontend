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

  it('shares one in-flight fetch between concurrent callers for the same URL', async () => {
    const blob = new Blob(['a']);
    let resolveFetch: (blob: Blob) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const p1 = getOrFetchBlob('https://example.com/a', fetcher, () => 0);
    const p2 = getOrFetchBlob('https://example.com/a', fetcher, () => 0);
    resolveFetch!(blob);

    const [b1, b2] = await Promise.all([p1, p2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(b1).toBe(blob);
    expect(b2).toBe(blob);
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
});
