import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchOriginalBlob, MAX_SAVE_BYTES } from './fetchOriginal';
import { SaveFailedError } from './types';
import type { MediaObject } from './types';
import type { ContentAccessRecovery } from '$lib/media/contentAccessRecovery';

const { recoverContentAccessMock } = vi.hoisted(() => ({
  recoverContentAccessMock: vi.fn<() => Promise<ContentAccessRecovery>>(),
}));

vi.mock('$lib/media/contentAccessRecovery', () => ({
  recoverContentAccess: recoverContentAccessMock,
}));

function fakeResponse(opts: {
  ok: boolean;
  status: number;
  contentType?: string;
  contentLength?: string;
  blob?: Blob;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: {
      get: (key: string) => {
        if (key === 'content-type') return opts.contentType ?? null;
        if (key === 'content-length') return opts.contentLength ?? null;
        return null;
      },
    },
    blob: () => Promise.resolve(opts.blob ?? new Blob(['bytes'])),
  } as unknown as Response;
}

function media(overrides: Partial<MediaObject['original']> = {}): MediaObject {
  return {
    media_type: 'image',
    original: {
      url: '/v1/content/outputs/123e4567-e89b-12d3-a456-426614174000',
      content_type: 'image/jpeg',
      size_bytes: 1024,
      ...overrides,
    },
    variants: [
      {
        label: 'thumb',
        url: '/v1/content/outputs/variant-should-never-be-fetched',
        width: 256,
        height: 256,
      },
    ],
  };
}

describe('fetchOriginalBlob', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    recoverContentAccessMock.mockReset();
    recoverContentAccessMock.mockResolvedValue({ ok: true, via: 'remint' });
  });

  it('requests the original url, never a variants[*] url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchOriginalBlob(media());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestedUrl] = fetchMock.mock.calls[0];
    expect(requestedUrl).toBe(
      'http://localhost:8000/v1/content/outputs/123e4567-e89b-12d3-a456-426614174000',
    );
    expect(requestedUrl).not.toContain('variant-should-never-be-fetched');
  });

  it('returns the original bytes and content type', async () => {
    const original = new Blob(['original-bytes']);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          fakeResponse({ ok: true, status: 200, contentType: 'image/png', blob: original }),
        ),
    );

    const blob = await fetchOriginalBlob(media());

    expect(await blob.text()).toBe('original-bytes');
    expect(blob.type).toBe('image/png');
  });

  it('retries the same URL once after a 401 and a successful content-access recovery', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const blob = await fetchOriginalBlob(media());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
    expect(recoverContentAccessMock).toHaveBeenCalledTimes(1);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('never recovers twice: a second 401 is an auth failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOriginalBlob(media())).rejects.toMatchObject({ reason: 'auth' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recoverContentAccessMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unauthorized', 'auth'],
    ['revoked', 'auth'],
    ['stale', 'auth'],
    ['transient', 'network'],
    ['rate_limited', 'network'],
    ['aborted', 'network'],
  ] as const)('a %s recovery fails as %s without a second request', async (reason, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    recoverContentAccessMock.mockResolvedValue({ ok: false, reason });

    await expect(fetchOriginalBlob(media())).rejects.toMatchObject({ reason: expected });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://evil.example.com/file.jpg',
    'https://bucket.r2.cloudflarestorage.com/out.png?X-Amz-Signature=abc',
    '/v1/users/me',
  ])('rejects %s without issuing any request', async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOriginalBlob(media({ url }))).rejects.toBeInstanceOf(SaveFailedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses content-cookie credentials without an Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchOriginalBlob(media());

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.credentials).toBe('include');
    expect(new Headers(requestInit.headers).has('authorization')).toBe(false);
  });

  it('defaults to no-store and honours an explicit cache mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchOriginalBlob(media());
    await fetchOriginalBlob(media(), undefined, 'default');

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
    expect(fetchMock.mock.calls[1][1].cache).toBe('default');
  });

  it('short-circuits without a request when size_bytes exceeds the cap', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchOriginalBlob(media({ size_bytes: MAX_SAVE_BYTES + 1 })),
    ).rejects.toMatchObject({
      reason: 'too-large',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws too-large when content-length exceeds the cap, without reading the body', async () => {
    const blobSpy = vi.fn().mockResolvedValue(new Blob(['bytes']));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key === 'content-length' ? String(MAX_SAVE_BYTES + 1) : null),
      },
      blob: blobSpy,
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOriginalBlob(media())).rejects.toMatchObject({
      reason: 'too-large',
    });
    expect(blobSpy).not.toHaveBeenCalled();
  });
});
