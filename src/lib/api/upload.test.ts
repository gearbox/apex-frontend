import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeTokenResponse } from '../../mocks/factories/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { uploadMedia } from './upload';
import { setAuth, clearAuth, getAccessToken } from '$lib/stores/auth';
import { clearRateLimits } from '$lib/stores/rateLimit';
import { invalidateAuthOperations } from '$lib/stores/authLifecycle';
import { STORAGE_KEYS } from '$lib/utils/constants';

// The MSW server is started/reset/stopped via src/tests/setup.ts

const UPLOAD_URL = 'http://localhost:8000/v1/storage/upload';
const BASE = 'http://localhost:8000';

beforeEach(() => {
  clearAuth();
  clearRateLimits();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function authTokens(accessToken: string, refreshToken: string) {
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const mockUploadResponse = {
  id: 'upload_001',
  filename: 'test.jpg',
  created_at: '2025-01-01T00:00:00Z',
  expires_at: '2025-02-01T00:00:00Z',
  media: {
    media_type: 'image',
    original: {
      url: '/v1/content/uploads/upload_001',
      width: 1024,
      height: 768,
      content_type: 'image/jpeg',
      size_bytes: 1000,
    },
    variants: [
      { label: 'sm', width: 150, height: 113, url: '/v1/content/uploads/upload_001_sm' },
      { label: 'md', width: 512, height: 384, url: '/v1/content/uploads/upload_001_md' },
    ],
  },
};

describe('uploadMedia', () => {
  it('sends request with auth header and returns UploadResponse with media', async () => {
    setAuth(authTokens('mock-token', 'mock-refresh-token'), makeUserProfile());

    let capturedAuth: string | null = null;
    let capturedMethod: string = '';

    server.use(
      http.post(UPLOAD_URL, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        capturedMethod = request.method;
        return HttpResponse.json(mockUploadResponse, { status: 201 });
      }),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await uploadMedia(file);

    expect(result.id).toBe('upload_001');
    expect(result.media.original.url).toBe('/v1/content/uploads/upload_001');
    expect(capturedMethod).toBe('POST');
    expect(capturedAuth).toBe('Bearer mock-token');
  });

  it('uploads MP4 files and returns a video response without poster variants', async () => {
    const file = new File(['test'], 'clip.mp4', { type: 'video/mp4' });
    const result = await uploadMedia(file);

    expect(result.id).toBe('upload_new_video_001');
    expect(result.media.media_type).toBe('video');
    expect(result.media.original.content_type).toBe('video/mp4');
    expect(result.media.variants).toEqual([]);
  });

  it('surfaces a server video-validation message verbatim', async () => {
    server.use(
      http.post(UPLOAD_URL, () =>
        HttpResponse.json(
          {
            error: 'invalid_video',
            message: 'File is not a decodable video',
            status_code: 400,
          },
          { status: 400 },
        ),
      ),
    );

    const file = new File(['test'], 'broken.mp4', { type: 'video/mp4' });
    await expect(uploadMedia(file)).rejects.toMatchObject({
      error: 'invalid_video',
      message: 'File is not a decodable video',
    });
  });

  it('throws ApiRequestError with fallback when response body is not JSON', async () => {
    server.use(
      http.post(
        UPLOAD_URL,
        () =>
          new HttpResponse('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          }),
      ),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    await expect(uploadMedia(file)).rejects.toMatchObject({
      status_code: 500,
    });
  });
});

describe('uploadMedia() — 401 refresh-and-retry (H2)', () => {
  it('first call 401, silentRefresh succeeds, second call 201: returns UploadResponse', async () => {
    setAuth(authTokens('stale-access-token', 'valid-refresh-token'), makeUserProfile());
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'valid-refresh-token');

    const newTokens = makeTokenResponse({ access_token: 'fresh-access-token' });
    const profile = makeUserProfile();

    let uploadCallCount = 0;
    let refreshCallCount = 0;
    const capturedAuthHeaders: (string | null)[] = [];

    server.use(
      http.post(UPLOAD_URL, ({ request }) => {
        uploadCallCount++;
        capturedAuthHeaders.push(request.headers.get('Authorization'));
        if (uploadCallCount === 1) {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json(mockUploadResponse, { status: 201 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => {
        refreshCallCount++;
        return HttpResponse.json(newTokens);
      }),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await uploadMedia(file);

    expect(uploadCallCount).toBe(2);
    expect(refreshCallCount).toBe(1);
    expect(capturedAuthHeaders).toEqual(['Bearer stale-access-token', 'Bearer fresh-access-token']);
    expect(result.id).toBe('upload_001');
    expect(getAccessToken()).toBe('fresh-access-token');
  });

  it('returns a completed upload when a sibling rotates the token mid-flight without retrying', async () => {
    const profile = makeUserProfile();
    setAuth(authTokens('initial-access-token', 'initial-refresh-token'), profile);
    const response = deferred<Response>();
    const started = deferred<void>();
    let uploadCallCount = 0;

    server.use(
      http.post(UPLOAD_URL, () => {
        uploadCallCount++;
        started.resolve();
        return response.promise;
      }),
    );

    const upload = uploadMedia(new File(['test'], 'test.jpg', { type: 'image/jpeg' }));
    await started.promise;
    setAuth(authTokens('rotated-access-token', 'rotated-refresh-token'), profile);
    response.resolve(HttpResponse.json(mockUploadResponse, { status: 201 }));

    await expect(upload).resolves.toMatchObject({ id: 'upload_001' });
    expect(uploadCallCount).toBe(1);
  });

  it('retries a 401 with a sibling-rotated token without refreshing again', async () => {
    const profile = makeUserProfile();
    setAuth(authTokens('stale-access-token', 'initial-refresh-token'), profile);
    const firstResponse = deferred<Response>();
    const firstStarted = deferred<void>();
    let uploadCallCount = 0;
    let refreshCallCount = 0;
    const capturedAuthHeaders: (string | null)[] = [];

    server.use(
      http.post(UPLOAD_URL, ({ request }) => {
        uploadCallCount++;
        capturedAuthHeaders.push(request.headers.get('Authorization'));
        if (uploadCallCount === 1) {
          firstStarted.resolve();
          return firstResponse.promise;
        }
        return HttpResponse.json(mockUploadResponse, { status: 201 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => {
        refreshCallCount++;
        return HttpResponse.json(makeTokenResponse());
      }),
    );

    const upload = uploadMedia(new File(['test'], 'test.jpg', { type: 'image/jpeg' }));
    await firstStarted.promise;
    setAuth(authTokens('sibling-fresh-access-token', 'sibling-fresh-refresh-token'), profile);
    firstResponse.resolve(HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    await expect(upload).resolves.toMatchObject({ id: 'upload_001' });
    expect(uploadCallCount).toBe(2);
    expect(refreshCallCount).toBe(0);
    expect(capturedAuthHeaders).toEqual([
      'Bearer stale-access-token',
      'Bearer sibling-fresh-access-token',
    ]);
  });

  it('401 followed by failed refresh: throws without a second upload attempt', async () => {
    setAuth(authTokens('stale-access-token', 'revoked-refresh-token'), makeUserProfile());
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'revoked-refresh-token');

    let uploadCallCount = 0;

    server.use(
      http.post(UPLOAD_URL, () => {
        uploadCallCount++;
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () =>
        HttpResponse.json(
          { error: 'token_revoked', message: 'Refresh token has been revoked', status_code: 401 },
          { status: 401 },
        ),
      ),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    await expect(uploadMedia(file)).rejects.toThrow();
    expect(uploadCallCount).toBe(1);
  });

  it('uses the shared terminal-refresh redirect and preserves its failure reason', async () => {
    const { consumeAuthFailureReason } = await import('$lib/stores/auth');
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'revoked-refresh-token');
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        set href(value: string) {
          hrefSetter(value);
        },
      },
      writable: true,
    });

    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })),
      http.post(`${BASE}/v1/auth/refresh`, () =>
        HttpResponse.json({ error: 'token_reuse_detected' }, { status: 401 }),
      ),
    );

    await expect(
      uploadMedia(new File(['test'], 'test.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow();

    expect(hrefSetter).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
    expect(consumeAuthFailureReason()).toBe('token_reuse_detected');
  });

  it('aborts an in-flight upload when its auth session is invalidated', async () => {
    setAuth(authTokens('access-token', 'refresh-token'), makeUserProfile());
    const response = deferred<Response>();
    const started = deferred<void>();
    let uploadCallCount = 0;

    server.use(
      http.post(UPLOAD_URL, () => {
        uploadCallCount++;
        started.resolve();
        return response.promise;
      }),
    );

    const upload = uploadMedia(new File(['test'], 'test.jpg', { type: 'image/jpeg' }));
    await started.promise;
    invalidateAuthOperations();
    response.resolve(HttpResponse.json(mockUploadResponse, { status: 201 }));

    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(uploadCallCount).toBe(1);
  });
});
