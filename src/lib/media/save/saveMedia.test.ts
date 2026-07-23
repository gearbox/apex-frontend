import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveMedia } from './saveMedia';
import { SaveActivationError, SaveFailedError } from './types';
import type { MediaObject, SaveMediaDeps } from './types';
import { clear as clearBlobCache } from './blobCache';
import { resolveSaveCapabilities } from './capabilities';

vi.mock('./capabilities', () => ({
  resolveSaveCapabilities: vi.fn(),
}));

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
    ...overrides,
  };
}

describe('saveMedia', () => {
  beforeEach(() => {
    clearBlobCache();
    vi.mocked(resolveSaveCapabilities).mockReturnValue(['share', 'download']);
  });

  it('does not refetch on a second call within the 60s cache TTL', async () => {
    const fetchBlob = vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/jpeg' }));
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(1000);
    const deps = makeDeps({ fetchBlob, now });

    await saveMedia('download', media(), 'id-1', deps);
    await saveMedia('download', media(), 'id-1', deps);

    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache entry is outside the TTL', async () => {
    const fetchBlob = vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/jpeg' }));
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(60_001);
    const deps = makeDeps({ fetchBlob, now });

    await saveMedia('download', media(), 'id-1', deps);
    await saveMedia('download', media(), 'id-1', deps);

    expect(fetchBlob).toHaveBeenCalledTimes(2);
  });

  it('falls back to download when share is unsupported and download is available', async () => {
    const download = vi.fn().mockReturnValue('downloaded');
    const share = vi.fn().mockRejectedValue(new SaveFailedError('unsupported'));
    const deps = makeDeps({ share, download });

    const outcome = await saveMedia('share', media(), 'id-2', deps);

    expect(outcome).toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(1);
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
