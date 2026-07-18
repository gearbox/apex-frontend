import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

const { silentRefreshMock } = vi.hoisted(() => ({
  silentRefreshMock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('$lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/auth')>()),
  silentRefresh: silentRefreshMock,
}));

import {
  AuthenticatedMediaLoadError,
  loadAuthenticatedMediaBlob,
  MAX_LIVE_FRAME_MEDIA_BYTES,
} from './loadAuthenticatedMediaBlob';
import * as authStore from '$lib/stores/auth';
import { clearAuth, setAuth, type UserProfile } from '$lib/stores/auth';

const BASE = 'http://localhost:8000';
const profile: UserProfile = {
  id: 'user-1',
  email: 'user@example.test',
  display_name: null,
  role: 'user',
  subscription_tier: 'free',
  email_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  age_verified: true,
};

let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;
let previousCreateObjectUrl: PropertyDescriptor | undefined;
let previousRevokeObjectUrl: PropertyDescriptor | undefined;

function setSession(accessToken = 'frame-access-token', refreshToken = 'frame-refresh-token') {
  setAuth(
    {
      accessToken,
      refreshToken,
      expiresAt: '2026-12-31T00:00:00Z',
    },
    profile,
  );
}

function videoResponse(status = 200, contentType = 'video/mp4') {
  return new HttpResponse(new Blob(['video-bytes'], { type: contentType }), {
    status,
    headers: { 'content-type': contentType },
  });
}

beforeEach(() => {
  clearAuth();
  localStorage.clear();
  silentRefreshMock.mockReset();
  silentRefreshMock.mockResolvedValue(false);
  createObjectUrl = vi.fn(() => 'blob:authenticated-video');
  revokeObjectUrl = vi.fn();
  previousCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  previousRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  if (previousCreateObjectUrl)
    Object.defineProperty(URL, 'createObjectURL', previousCreateObjectUrl);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (previousRevokeObjectUrl)
    Object.defineProperty(URL, 'revokeObjectURL', previousRevokeObjectUrl);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadAuthenticatedMediaBlob', () => {
  it.each(['/v1/content/outputs/output-1', '/v1/content/uploads/upload-1'])(
    'authenticates and creates a blob URL for %s',
    async (path) => {
      setSession();
      let authorization = '';
      let credentials: RequestCredentials | undefined;
      let cache: RequestCache | undefined;
      let productId: string | null = null;
      server.use(
        http.get(`${BASE}${path}`, ({ request }) => {
          authorization = request.headers.get('authorization') ?? '';
          productId = request.headers.get('x-product-id');
          credentials = request.credentials;
          cache = request.cache;
          return videoResponse();
        }),
      );

      await expect(loadAuthenticatedMediaBlob(path)).resolves.toEqual({
        objectUrl: 'blob:authenticated-video',
        contentType: 'video/mp4',
      });

      expect(authorization).toBe('Bearer frame-access-token');
      expect(credentials).toBe('include');
      expect(cache).toBe('no-store');
      if (import.meta.env.DEV) expect(productId).toBe(import.meta.env.VITE_PRODUCT_ID || 'vex');
      else expect(productId).toBeNull();
      expect(createObjectUrl).toHaveBeenCalledOnce();
    },
  );

  it('refreshes once after a 401 and retries with the new bearer token', async () => {
    setSession('expired-token');
    silentRefreshMock.mockImplementation(async () => {
      setSession('refreshed-token');
      return true;
    });
    const authorizations: string[] = [];
    let contentRequests = 0;

    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, ({ request }) => {
        contentRequests += 1;
        authorizations.push(request.headers.get('authorization') ?? '');
        return contentRequests === 1 ? new HttpResponse(null, { status: 401 }) : videoResponse();
      }),
    );

    await expect(loadAuthenticatedMediaBlob('/v1/content/outputs/output-1')).resolves.toMatchObject(
      {
        objectUrl: 'blob:authenticated-video',
      },
    );

    expect(authorizations).toEqual(['Bearer expired-token', 'Bearer refreshed-token']);
    expect(contentRequests).toBe(2);
    expect(silentRefreshMock).toHaveBeenCalledOnce();
  });

  it('returns an authentication error when refresh fails and does not retry the content request', async () => {
    setSession();
    let contentRequests = 0;
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, () => {
        contentRequests += 1;
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    );

    const error = await loadAuthenticatedMediaBlob('/v1/content/outputs/output-1').catch(
      (err) => err,
    );

    expect(error).toBeInstanceOf(AuthenticatedMediaLoadError);
    expect(error).toMatchObject({ category: 'authentication', status: 401, retryAttempted: true });
    expect(contentRequests).toBe(1);
  });

  it('never retries a second 401', async () => {
    setSession();
    silentRefreshMock.mockResolvedValue(true);
    let contentRequests = 0;
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, () => {
        contentRequests += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const error = await loadAuthenticatedMediaBlob('/v1/content/outputs/output-1').catch(
      (err) => err,
    );

    expect(error).toMatchObject({ category: 'authentication', status: 401, retryAttempted: true });
    expect(contentRequests).toBe(2);
    expect(silentRefreshMock).toHaveBeenCalledOnce();
  });

  it.each([
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'server'],
  ] as const)('maps HTTP %i to the safe %s category', async (status, category) => {
    setSession();
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, () => new HttpResponse(null, { status })),
    );

    const error = await loadAuthenticatedMediaBlob('/v1/content/outputs/output-1').catch(
      (err) => err,
    );

    expect(error).toMatchObject({ category, status, retryAttempted: false });
  });

  it('rejects non-video content without exposing a protected URL or token in diagnostics', async () => {
    const token = 'not-for-logs';
    setSession(token);
    server.use(
      http.get(
        `${BASE}/v1/content/outputs/output-1`,
        () =>
          new HttpResponse(new Blob(['not-video'], { type: 'text/plain' }), {
            headers: { 'content-type': 'text/plain' },
          }),
      ),
    );

    const error = await loadAuthenticatedMediaBlob('/v1/content/outputs/output-1').catch(
      (err) => err,
    );

    expect(error).toMatchObject({ category: 'invalid-content-type', status: 200 });
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain(token);
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain(
      `${BASE}/v1/content/outputs/output-1`,
    );
  });

  it('maps an aborted request to an aborted error without creating an object URL', async () => {
    setSession();
    const abortController = new AbortController();
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        return videoResponse();
      }),
    );

    const request = loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
      signal: abortController.signal,
    });
    abortController.abort();

    await expect(request).rejects.toMatchObject({ category: 'aborted' });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('allows an absolute protected-content URL on the configured API origin', async () => {
    setSession();
    let authorization = '';
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, ({ request }) => {
        authorization = request.headers.get('authorization') ?? '';
        return videoResponse();
      }),
    );

    await expect(
      loadAuthenticatedMediaBlob(`${BASE}/v1/content/outputs/output-1`),
    ).resolves.toEqual({
      objectUrl: 'blob:authenticated-video',
      contentType: 'video/mp4',
    });
    expect(authorization).toBe('Bearer frame-access-token');
  });

  it.each([
    'https://attacker.example.test/v1/content/outputs/output-1',
    'https://localhost:8000.attacker.example.test/v1/content/outputs/output-1',
    '/v1/users/me',
    'http://token@localhost:8000/v1/content/outputs/output-1',
    '//attacker.example.test/v1/content/outputs/output-1',
    '/v1/content/outputs/',
    '/v1/content/outputs/output-1#fragment',
  ])('rejects %s before it can receive a bearer token', async (value) => {
    const token = 'never-send-this-token';
    setSession(token);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const accessTokenSpy = vi.spyOn(authStore, 'getAccessToken');

    const error = await loadAuthenticatedMediaBlob(value).catch((err) => err);

    expect(error).toMatchObject({ category: 'invalid-url' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(accessTokenSpy).not.toHaveBeenCalled();
    const diagnostics = JSON.stringify(vi.mocked(console.debug).mock.calls);
    expect(diagnostics).not.toContain(token);
    expect(diagnostics).not.toContain(value);
  });

  it('normalizes a thrown refresh error without retrying or logging its raw message', async () => {
    const refreshError = new Error('refresh network diagnostic must stay private');
    setSession();
    silentRefreshMock.mockRejectedValue(refreshError);
    let contentRequests = 0;
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, () => {
        contentRequests += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const error = await loadAuthenticatedMediaBlob('/v1/content/outputs/output-1').catch(
      (err) => err,
    );

    expect(error).toBeInstanceOf(AuthenticatedMediaLoadError);
    expect(error).toMatchObject({ category: 'network', status: null, retryAttempted: true });
    expect(contentRequests).toBe(1);
    expect(silentRefreshMock).toHaveBeenCalledOnce();
    const diagnostics = JSON.stringify(vi.mocked(console.debug).mock.calls);
    expect(diagnostics).toContain('"stage":"refresh"');
    expect(diagnostics).not.toContain(refreshError.message);
  });

  it('normalizes an abort while refresh is pending and does not issue a second request', async () => {
    setSession();
    let resolveRefresh!: (value: boolean) => void;
    silentRefreshMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    let contentRequests = 0;
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, () => {
        contentRequests += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );
    const abortController = new AbortController();
    const request = loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
      signal: abortController.signal,
    });

    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledOnce());
    abortController.abort();
    resolveRefresh(true);

    await expect(request).rejects.toMatchObject({ category: 'aborted', retryAttempted: true });
    expect(contentRequests).toBe(1);
  });

  it('normalizes an abort immediately after refresh resolves', async () => {
    setSession();
    const abortController = new AbortController();
    silentRefreshMock.mockImplementation(async () => {
      abortController.abort();
      return true;
    });
    let contentRequests = 0;
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, () => {
        contentRequests += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(
      loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
        signal: abortController.signal,
      }),
    ).rejects.toMatchObject({ category: 'aborted', retryAttempted: true });
    expect(contentRequests).toBe(1);
  });

  it('rejects an oversized expected media size before fetching', async () => {
    setSession();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(
      loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
        expectedSizeBytes: MAX_LIVE_FRAME_MEDIA_BYTES + 1,
      }),
    ).rejects.toMatchObject({ category: 'too-large' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts an expected media size below the configured limit', async () => {
    setSession();
    server.use(
      http.get(
        `${BASE}/v1/content/outputs/output-1`,
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'video/mp4', 'content-length': '3' },
          }),
      ),
    );

    await expect(
      loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
        expectedSizeBytes: 3,
        maxSizeBytes: 5,
      }),
    ).resolves.toMatchObject({ objectUrl: 'blob:authenticated-video' });
  });

  it('accepts an expected size and Content-Length at the exact limit', async () => {
    setSession();
    server.use(
      http.get(
        `${BASE}/v1/content/outputs/output-1`,
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3, 4, 5]), {
            headers: { 'content-type': 'video/mp4', 'content-length': '5' },
          }),
      ),
    );

    await expect(
      loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
        expectedSizeBytes: 5,
        maxSizeBytes: 5,
      }),
    ).resolves.toMatchObject({ objectUrl: 'blob:authenticated-video' });
  });

  it('rejects an excessive or conflicting Content-Length before reading the body', async () => {
    setSession();
    server.use(
      http.get(
        `${BASE}/v1/content/outputs/output-1`,
        () =>
          new HttpResponse(new Uint8Array([1]), {
            headers: { 'content-type': 'video/mp4', 'content-length': '6' },
          }),
      ),
    );

    await expect(
      loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
        expectedSizeBytes: 5,
        maxSizeBytes: 5,
      }),
    ).rejects.toMatchObject({ category: 'too-large', status: 200 });
  });

  it('streams a response without Content-Length within the configured bound', async () => {
    setSession();
    server.use(
      http.get(
        `${BASE}/v1/content/outputs/output-1`,
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'video/mp4' } }),
      ),
    );

    await expect(
      loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
        expectedSizeBytes: 3,
        maxSizeBytes: 5,
      }),
    ).resolves.toMatchObject({ objectUrl: 'blob:authenticated-video' });
  });

  it('stops a stream that exceeds its byte limit', async () => {
    setSession();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(body, { headers: { 'content-type': 'video/mp4' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
        expectedSizeBytes: 5,
        maxSizeBytes: 5,
      }),
    ).rejects.toMatchObject({ category: 'too-large' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('normalizes an abort during a streamed body read', async () => {
    setSession();
    let resolvePull!: () => void;
    let startRead!: () => void;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        startRead();
        return new Promise<void>((resolve) => {
          resolvePull = resolve;
        });
      },
      cancel() {
        resolvePull();
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(body, { headers: { 'content-type': 'video/mp4' } }));
    vi.stubGlobal('fetch', fetchMock);
    const abortController = new AbortController();
    const readStarted = new Promise<void>((resolve) => {
      startRead = resolve;
    });

    const request = loadAuthenticatedMediaBlob('/v1/content/outputs/output-1', {
      signal: abortController.signal,
      maxSizeBytes: 5,
    });
    await readStarted;
    abortController.abort();

    await expect(request).rejects.toMatchObject({ category: 'aborted' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
