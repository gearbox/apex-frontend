import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeMediaObject } from '../../mocks/factories/media';
import { clearAuth, setAuth, type UserProfile } from '$lib/stores/auth';
import { loadAuthenticatedMediaBlob } from './loadAuthenticatedMediaBlob';
import { fetchOriginalBytes } from './progressive';
import { fetchOriginalBlob } from './save/fetchOriginal';

/**
 * Architectural invariant: protected media bytes are fetched through stable `/v1/content/...`
 * URLs using content-cookie credentials, without access-token Bearer headers.
 *
 * Every protected byte-fetch path is exercised against a live session so that reintroducing an
 * `Authorization` header (or dropping `credentials: 'include'`) on any of them fails here.
 */

const BASE = 'http://localhost:8000';
const ACCESS_TOKEN = 'access-token-must-not-reach-content-gets';

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

interface CapturedRequest {
  url: string;
  authorization: string | null;
  credentials: RequestCredentials;
}

let captured: CapturedRequest[];
let previousCreateObjectUrl: PropertyDescriptor | undefined;

function capture(contentType: string) {
  return http.get(`${BASE}/v1/content/:collection/:id`, ({ request }) => {
    captured.push({
      url: request.url,
      authorization: request.headers.get('authorization'),
      credentials: request.credentials,
    });
    return new HttpResponse(new Blob(['bytes'], { type: contentType }), {
      headers: { 'content-type': contentType, 'content-length': '5' },
    });
  });
}

function expectCookieOnlyContentRequest(expectedPath: string): void {
  expect(captured).toHaveLength(1);
  const [request] = captured;
  expect(request.url).toBe(`${BASE}${expectedPath}`);
  expect(new URL(request.url).search).toBe('');
  expect(request.authorization).toBeNull();
  expect(request.credentials).toBe('include');
}

beforeEach(() => {
  captured = [];
  setAuth(
    {
      accessToken: ACCESS_TOKEN,
      refreshToken: 'refresh-token',
      expiresAt: '2026-12-31T00:00:00Z',
      contentCookieExpiresAt: '2026-12-31T00:00:00Z',
    },
    profile,
  );
  previousCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:protected'),
  });
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  clearAuth();
  if (previousCreateObjectUrl)
    Object.defineProperty(URL, 'createObjectURL', previousCreateObjectUrl);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  vi.restoreAllMocks();
});

describe('protected media bytes use content-cookie credentials, never a Bearer header', () => {
  it('frame decoding blob load (loadAuthenticatedMediaBlob)', async () => {
    server.use(capture('video/mp4'));

    await loadAuthenticatedMediaBlob('/v1/content/outputs/output-1');

    expectCookieOnlyContentRequest('/v1/content/outputs/output-1');
  });

  it('progressive original upgrade (fetchOriginalBytes)', async () => {
    server.use(capture('image/jpeg'));
    const media = makeMediaObject();

    await fetchOriginalBytes(media);

    expectCookieOnlyContentRequest(new URL(media.original.url, BASE).pathname);
  });

  it('save/share original (fetchOriginalBlob)', async () => {
    server.use(capture('image/png'));

    await fetchOriginalBlob(
      makeMediaObject({
        original: { ...makeMediaObject().original, url: '/v1/content/uploads/upload-1' },
      }),
    );

    expectCookieOnlyContentRequest('/v1/content/uploads/upload-1');
  });
});
