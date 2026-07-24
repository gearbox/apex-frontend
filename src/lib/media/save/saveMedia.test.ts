import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveMedia } from './saveMedia';
import { SaveActivationError, SaveFailedError } from './types';
import type { MediaObject, SaveMediaDeps } from './types';
import { clearBlobCache } from './blobCache';

function media(): MediaObject {
  return {
    media_type: 'image',
    original: { url: '/v1/content/outputs/id', content_type: 'image/jpeg', size_bytes: 10 },
    variants: [],
  };
}

function makeDeps(overrides: Partial<SaveMediaDeps> = {}): Partial<SaveMediaDeps> {
  return {
    fetchBlob: vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/jpeg' })),
    share: vi.fn().mockResolvedValue('shared'),
    download: vi.fn().mockReturnValue('downloaded'),
    now: vi.fn().mockReturnValue(0),
    capabilities: vi.fn().mockReturnValue(['share', 'download']),
    ...overrides,
  };
}

describe('saveMedia', () => {
  beforeEach(() => {
    clearBlobCache();
  });

  it('stamps the cache entry with the post-fetch timestamp, not the pre-fetch one', async () => {
    // A slow fetch: lookup at 0, but the bytes don't land (and the entry is stored) until
    // 50_000. The second call at 100_000 is only 50s after the store, so it must hit the
    // cache. If the entry were stamped at fetch-start (0) instead, 100_000 - 0 = 100_000
    // would be outside the 60s TTL and this would incorrectly refetch.
    const fetchBlob = vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/jpeg' }));
    const now = vi
      .fn()
      .mockReturnValueOnce(0) // first call: cache lookup (miss)
      .mockReturnValueOnce(50_000) // first call: cache store, after the fetch resolves
      .mockReturnValueOnce(100_000); // second call: cache lookup
    const deps = makeDeps({ fetchBlob, now });

    await saveMedia('download', media(), 'id-1', deps);
    await saveMedia('download', media(), 'id-1', deps);

    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on a second call within the 60s cache TTL', async () => {
    const fetchBlob = vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/jpeg' }));
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(30_000);
    const deps = makeDeps({ fetchBlob, now });

    await saveMedia('download', media(), 'id-1', deps);
    await saveMedia('download', media(), 'id-1', deps);

    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache entry is outside the TTL', async () => {
    const fetchBlob = vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/jpeg' }));
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(61_001);
    const deps = makeDeps({ fetchBlob, now });

    await saveMedia('download', media(), 'id-1', deps);
    await saveMedia('download', media(), 'id-1', deps);

    expect(fetchBlob).toHaveBeenCalledTimes(2);
  });

  it('falls back to download when share is unsupported and download is available', async () => {
    const download = vi.fn().mockReturnValue('downloaded');
    const share = vi.fn().mockRejectedValue(new SaveFailedError('unsupported'));
    const deps = makeDeps({ share, download, capabilities: vi.fn().mockReturnValue(['download']) });

    const outcome = await saveMedia('share', media(), 'id-2', deps);

    expect(outcome).toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to download when the injected capabilities exclude it', async () => {
    const download = vi.fn().mockReturnValue('downloaded');
    const share = vi.fn().mockRejectedValue(new SaveFailedError('unsupported'));
    const deps = makeDeps({ share, download, capabilities: vi.fn().mockReturnValue(['share']) });

    await expect(saveMedia('share', media(), 'id-2b', deps)).rejects.toBeInstanceOf(
      SaveFailedError,
    );
    expect(download).not.toHaveBeenCalled();
  });

  it('gives an untyped blob a fallback MIME type before handing it to the share sheet', async () => {
    const untyped = new Blob(['bytes'], { type: '' });
    const fetchBlob = vi.fn().mockResolvedValue(untyped);
    const share = vi.fn().mockResolvedValue('shared');
    const deps = makeDeps({ fetchBlob, share });

    await saveMedia('share', media(), 'id-5', deps);

    const [file] = (share as ReturnType<typeof vi.fn>).mock.calls[0] as [File];
    expect(file.type).toBe('image/jpeg'); // falls back to media.original.content_type
  });

  it('falls back to a generic MIME type when neither the blob nor the metadata has one', async () => {
    const untyped = new Blob(['bytes'], { type: '' });
    const fetchBlob = vi.fn().mockResolvedValue(untyped);
    const share = vi.fn().mockResolvedValue('shared');
    const deps = makeDeps({ fetchBlob, share });
    const untypedMedia: MediaObject = {
      ...media(),
      original: { ...media().original, content_type: '' },
    };

    await saveMedia('share', untypedMedia, 'id-6', deps);

    const [file] = (share as ReturnType<typeof vi.fn>).mock.calls[0] as [File];
    expect(file.type).toBe('application/octet-stream');
  });

  it('propagates SaveActivationError from share without falling back to download', async () => {
    const share = vi.fn().mockRejectedValue(new SaveActivationError());
    const download = vi.fn();
    const deps = makeDeps({ share, download });

    await expect(saveMedia('share', media(), 'id-3', deps)).rejects.toBeInstanceOf(
      SaveActivationError,
    );
    expect(download).not.toHaveBeenCalled();
  });

  it('returns "cancelled" without throwing', async () => {
    const share = vi.fn().mockResolvedValue('cancelled');
    const deps = makeDeps({ share });

    await expect(saveMedia('share', media(), 'id-4', deps)).resolves.toBe('cancelled');
  });
});
