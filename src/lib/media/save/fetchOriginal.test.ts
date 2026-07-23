import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchOriginalBlob, MAX_SAVE_BYTES } from './fetchOriginal';
import type { MediaObject } from './types';

const silentRefreshMock = vi.fn<() => Promise<boolean>>();
const getAccessTokenMock = vi.fn<() => string | null>();

vi.mock('$lib/api/auth', () => ({
  silentRefresh: () => silentRefreshMock(),
}));

vi.mock('$lib/stores/auth', () => ({
  getAccessToken: () => getAccessTokenMock(),
}));

function fakeResponse(opts: {
  ok: boolean;
  status: number;
  contentType?: string;
  blob?: Blob;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: { get: (key: string) => (key === 'content-type' ? (opts.contentType ?? null) : null) },
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
    silentRefreshMock.mockReset();
    getAccessTokenMock.mockReset();
    getAccessTokenMock.mockReturnValue('access-token');
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

  it('retries once after a 401 via silentRefresh, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    silentRefreshMock.mockResolvedValue(true);

    const blob = await fetchOriginalBlob(media());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(silentRefreshMock).toHaveBeenCalledTimes(1);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('sends no Authorization header when validateProtectedMediaUrl rejects the url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchOriginalBlob(media({ url: 'https://evil.example.com/file.jpg' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    expect((requestInit.headers as Record<string, string>).Authorization).toBeUndefined();
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
});
