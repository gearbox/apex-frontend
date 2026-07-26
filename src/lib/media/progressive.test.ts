import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeMediaObject, makeVideoMediaObject } from '../../mocks/factories/media';

const { silentRefreshMock } = vi.hoisted(() => ({
  silentRefreshMock: vi.fn<() => Promise<{ ok: true } | { ok: false; reason: string }>>(),
}));

vi.mock('$lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/auth')>()),
  silentRefresh: silentRefreshMock,
}));

import {
  fetchOriginalBytes,
  ProgressiveImageError,
  PROGRESSIVE_ORIGINAL_MAX_BYTES,
  shouldUpgradeToOriginal,
} from './progressive';

function streamedResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'image/jpeg', ...headers } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('progressive originals', () => {
  it('streams bytes and reports received/total progress without opting out of HTTP caching', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streamedResponse(['ab', 'cde'], { 'content-length': '5' }));
    vi.stubGlobal('fetch', fetchMock);
    const updates: Array<{ received: number; total: number | null }> = [];

    const blob = await fetchOriginalBytes(makeMediaObject(), {
      onprogress: (progress) => updates.push(progress),
    });

    expect(await blob?.text()).toBe('abcde');
    expect(updates).toEqual([
      { received: 0, total: 5 },
      { received: 2, total: 5 },
      { received: 5, total: 5 },
    ]);
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('cache');
  });

  it('refreshes once after 401 before retrying the protected original', async () => {
    silentRefreshMock.mockResolvedValue({ ok: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(streamedResponse(['ok'], { 'content-length': '2' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOriginalBytes(makeMediaObject())).resolves.toBeInstanceOf(Blob);
    expect(silentRefreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propagates an aborted protected request', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      }),
    );

    const pending = fetchOriginalBytes(makeMediaObject(), { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('skips non-images, oversized originals, and originals no larger than the md variant', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const standard = makeMediaObject();
    const oversized = makeMediaObject({
      original: { ...standard.original, size_bytes: PROGRESSIVE_ORIGINAL_MAX_BYTES + 1 },
    });
    const noDetail = makeMediaObject({
      original: { ...standard.original, width: 512, height: 512 },
    });

    expect(shouldUpgradeToOriginal(makeVideoMediaObject())).toBe(false);
    await expect(fetchOriginalBytes(makeVideoMediaObject())).resolves.toBeNull();
    await expect(fetchOriginalBytes(oversized)).resolves.toBeNull();
    await expect(fetchOriginalBytes(noDetail)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a safe authentication error when refresh cannot recover the original request', async () => {
    silentRefreshMock.mockResolvedValue({ ok: false, reason: 'invalid_token' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(fetchOriginalBytes(makeMediaObject())).rejects.toEqual(
      expect.objectContaining<Partial<ProgressiveImageError>>({ reason: 'authentication' }),
    );
  });

  it('rejects immediately without issuing a request when the signal is already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchOriginalBytes(makeMediaObject(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels the reader and rejects once streamed bytes exceed the bound, regardless of a mismatched Content-Length', async () => {
    const overCap = new Uint8Array(PROGRESSIVE_ORIGINAL_MAX_BYTES + 1);
    let cancelCalls = 0;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          // Left open (no controller.close()) — once the read loop cancels, closing it too
          // would make cancel() a no-op on an already-finished stream and the assertion moot.
          controller.enqueue(overCap);
        },
        cancel() {
          cancelCalls += 1;
        },
      }),
      // A too-small declared Content-Length must not be trusted as the actual read bound.
      { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '10' } },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(fetchOriginalBytes(makeMediaObject())).rejects.toEqual(
      expect.objectContaining<Partial<ProgressiveImageError>>({ reason: 'request' }),
    );
    expect(cancelCalls).toBe(1);
  });
});
