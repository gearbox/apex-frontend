import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  AuthenticatedMediaLoadError,
  loadAuthenticatedMediaBlob,
} from './loadAuthenticatedMediaBlob';
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
  vi.restoreAllMocks();
});

describe('loadAuthenticatedMediaBlob', () => {
  it.each(['/v1/content/outputs/output-1', '/v1/content/uploads/upload-1'])(
    'authenticates and creates a blob URL for %s',
    async (path) => {
      setSession();
      let authorization = '';
      let credentials: RequestCredentials | undefined;
      let productId: string | null = null;
      server.use(
        http.get(`${BASE}${path}`, ({ request }) => {
          authorization = request.headers.get('authorization') ?? '';
          productId = request.headers.get('x-product-id');
          credentials = request.credentials;
          return videoResponse();
        }),
      );

      await expect(loadAuthenticatedMediaBlob(path)).resolves.toEqual({
        objectUrl: 'blob:authenticated-video',
        contentType: 'video/mp4',
      });

      expect(authorization).toBe('Bearer frame-access-token');
      expect(credentials).toBe('include');
      if (import.meta.env.DEV) expect(productId).toBe(import.meta.env.VITE_PRODUCT_ID || 'vex');
      else expect(productId).toBeNull();
      expect(createObjectUrl).toHaveBeenCalledOnce();
    },
  );

  it('refreshes once after a 401 and retries with the new bearer token', async () => {
    setSession('expired-token');
    const tokens = {
      access_token: 'refreshed-token',
      refresh_token: 'refreshed-refresh-token',
      token_type: 'bearer',
      expires_in: 900,
      expires_at: '2026-12-31T00:00:00Z',
    };
    const authorizations: string[] = [];
    let contentRequests = 0;

    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, ({ request }) => {
        contentRequests += 1;
        authorizations.push(request.headers.get('authorization') ?? '');
        return contentRequests === 1 ? new HttpResponse(null, { status: 401 }) : videoResponse();
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.json(tokens)),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    await expect(loadAuthenticatedMediaBlob('/v1/content/outputs/output-1')).resolves.toMatchObject(
      {
        objectUrl: 'blob:authenticated-video',
      },
    );

    expect(authorizations).toEqual(['Bearer expired-token', 'Bearer refreshed-token']);
    expect(contentRequests).toBe(2);
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
    const tokens = {
      access_token: 'refreshed-token',
      refresh_token: 'refreshed-refresh-token',
      token_type: 'bearer',
      expires_in: 900,
      expires_at: '2026-12-31T00:00:00Z',
    };
    let contentRequests = 0;
    server.use(
      http.get(`${BASE}/v1/content/outputs/output-1`, () => {
        contentRequests += 1;
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.json(tokens)),
      http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(profile)),
    );

    const error = await loadAuthenticatedMediaBlob('/v1/content/outputs/output-1').catch(
      (err) => err,
    );

    expect(error).toMatchObject({ category: 'authentication', status: 401, retryAttempted: true });
    expect(contentRequests).toBe(2);
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
});
