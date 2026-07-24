import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prewarmMedia, prewarmMediaWithSignal, PREWARM_MAX_BYTES } from './prewarm';
import { getCachedBlob, clearBlobCache } from './blobCache';
import { toMediaSrc } from '$lib/media/toMediaSrc';
import type { MediaObject } from './types';

const { fetchOriginalBlobMock } = vi.hoisted(() => ({
  fetchOriginalBlobMock: vi.fn(),
}));

vi.mock('./fetchOriginal', () => ({
  fetchOriginalBlob: fetchOriginalBlobMock,
}));

function media(overrides: Partial<MediaObject['original']> = {}): MediaObject {
  return {
    media_type: 'image',
    original: {
      url: '/v1/content/outputs/id',
      content_type: 'image/jpeg',
      size_bytes: 1024,
      ...overrides,
    },
    variants: [],
  };
}

beforeEach(() => {
  clearBlobCache();
  fetchOriginalBlobMock.mockReset();
});

describe('prewarmMedia', () => {
  it('fetches and caches media under the size cap', async () => {
    const blob = new Blob(['bytes']);
    fetchOriginalBlobMock.mockResolvedValue(blob);
    const asset = media({ size_bytes: 1024 });

    prewarmMedia(asset);
    await vi.waitFor(() => expect(fetchOriginalBlobMock).toHaveBeenCalledTimes(1));

    expect(getCachedBlob(toMediaSrc(asset.original.url), Date.now())).toBe(blob);
  });

  it('skips media larger than PREWARM_MAX_BYTES', async () => {
    const asset = { ...media({ size_bytes: PREWARM_MAX_BYTES + 1 }), media_type: 'video' as const };

    prewarmMedia(asset);
    await Promise.resolve();

    expect(fetchOriginalBlobMock).not.toHaveBeenCalled();
  });

  it('skips an unknown-size video rather than speculatively fetching its complete blob', async () => {
    const asset = { ...media({ size_bytes: undefined }), media_type: 'video' as const };

    prewarmMedia(asset);
    await Promise.resolve();

    expect(fetchOriginalBlobMock).not.toHaveBeenCalled();
  });

  it('keeps unknown-size images eligible for prewarming', async () => {
    const asset = media({ size_bytes: undefined });
    fetchOriginalBlobMock.mockResolvedValue(new Blob(['bytes']));

    prewarmMedia(asset);

    await vi.waitFor(() => expect(fetchOriginalBlobMock).toHaveBeenCalledWith(asset, undefined));
  });

  it('prewarms a known small video', async () => {
    const asset = { ...media({ size_bytes: PREWARM_MAX_BYTES }), media_type: 'video' as const };
    fetchOriginalBlobMock.mockResolvedValue(new Blob(['bytes']));

    prewarmMedia(asset);

    await vi.waitFor(() => expect(fetchOriginalBlobMock).toHaveBeenCalledWith(asset, undefined));
  });

  it('never throws or rejects when the fetch fails', async () => {
    fetchOriginalBlobMock.mockRejectedValue(new Error('network'));
    const asset = media();

    expect(() => prewarmMedia(asset)).not.toThrow();
    await vi.waitFor(() => expect(fetchOriginalBlobMock).toHaveBeenCalledTimes(1));
    // No unhandled rejection should surface — reaching this line without the test
    // runner flagging one is the assertion.
  });

  it('starts the fetch without a cancellation signal', () => {
    fetchOriginalBlobMock.mockResolvedValue(new Blob(['bytes']));
    const asset = media();

    prewarmMedia(asset);

    expect(fetchOriginalBlobMock).toHaveBeenCalledWith(asset, undefined);
  });

  it('passes an abort signal and viewer TTL through the abortable warm variant', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    const asset = { ...media(), media_type: 'video' as const };
    const controller = new AbortController();
    const blob = new Blob(['bytes']);
    fetchOriginalBlobMock.mockResolvedValue(blob);

    await prewarmMediaWithSignal(asset, { signal: controller.signal, ttlMs: 5 * 60_000 });

    expect(fetchOriginalBlobMock).toHaveBeenCalledWith(asset, controller.signal);
    expect(getCachedBlob(toMediaSrc(asset.original.url), 5 * 60_000 - 1)).toBe(blob);
  });
});
