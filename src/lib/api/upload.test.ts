import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeTokenResponse } from '../../mocks/factories/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { uploadImage } from './upload';
import { setAuth, clearAuth, getAccessToken } from '$lib/stores/auth';
import { clearRateLimits } from '$lib/stores/rateLimit';
import { STORAGE_KEYS } from '$lib/utils/constants';

// The MSW server is started/reset/stopped via src/tests/setup.ts

const UPLOAD_URL = 'http://localhost:8000/v1/storage/upload';
const BASE = 'http://localhost:8000';

beforeEach(() => {
  clearAuth();
  clearRateLimits();
  localStorage.clear();
});

function authTokens(accessToken: string, refreshToken: string) {
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };
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

describe('uploadImage', () => {
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
    const result = await uploadImage(file);

    expect(result.id).toBe('upload_001');
    expect(result.media.original.url).toBe('/v1/content/uploads/upload_001');
    expect(capturedMethod).toBe('POST');
    expect(capturedAuth).toBe('Bearer mock-token');
  });

  it('throws ApiRequestError on non-ok response', async () => {
    server.use(
      http.post(UPLOAD_URL, () =>
        HttpResponse.json(
          { error: 'file_too_large', message: 'File must be under 20 MB', status_code: 400 },
          { status: 400 },
        ),
      ),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    await expect(uploadImage(file)).rejects.toMatchObject({
      error: 'file_too_large',
      message: 'File must be under 20 MB',
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
    await expect(uploadImage(file)).rejects.toMatchObject({
      status_code: 500,
    });
  });
});

describe('uploadImage() — 401 refresh-and-retry (H2)', () => {
  it('first call 401, silentRefresh succeeds, second call 201: returns UploadResponse', async () => {
    setAuth(authTokens('stale-access-token', 'valid-refresh-token'), makeUserProfile());
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'valid-refresh-token');

    const newTokens = makeTokenResponse({ access_token: 'fresh-access-token' });
    const profile = makeUserProfile();

    let uploadCallCount = 0;
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
      http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.json(newTokens)),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await uploadImage(file);

    expect(uploadCallCount).toBe(2);
    expect(capturedAuthHeaders).toEqual(['Bearer stale-access-token', 'Bearer fresh-access-token']);
    expect(result.id).toBe('upload_001');
    expect(getAccessToken()).toBe('fresh-access-token');
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
    await expect(uploadImage(file)).rejects.toThrow();
    expect(uploadCallCount).toBe(1);
  });
});
