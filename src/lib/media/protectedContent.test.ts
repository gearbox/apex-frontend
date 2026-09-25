import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchProtectedContent,
  parseProtectedContentUrl,
  probeProtectedContent,
} from './protectedContent';
import { clearAuth, setAuth, type UserProfile } from '$lib/stores/auth';

const ORIGIN = 'http://localhost:8000';

describe('parseProtectedContentUrl', () => {
  it.each([
    ['/v1/content/outputs/123e4567-e89b-12d3-a456-426614174000', 'output'],
    ['/v1/content/uploads/upload_mock_001', 'upload'],
    ['/v1/content/outputs/vid_mock_001_poster_md', 'output'],
    ['/v1/content/outputs/abc.v2', 'output'],
  ] as const)('resolves root-relative %s to the API origin', (path, source) => {
    expect(parseProtectedContentUrl(path)).toEqual({ url: `${ORIGIN}${path}`, source });
  });

  it('accepts the canonical same-API-origin absolute URL', () => {
    const url = `${ORIGIN}/v1/content/outputs/out-1`;
    expect(parseProtectedContentUrl(url)).toEqual({ url, source: 'output' });
  });

  it.each([
    // Foreign origins, including look-alikes.
    'https://cdn.example.com/image.jpg',
    'https://attacker.example.test/v1/content/outputs/out-1',
    'http://localhost:8000.attacker.example.test/v1/content/outputs/out-1',
    'https://localhost:8000/v1/content/outputs/out-1',
    'http://localhost:9000/v1/content/outputs/out-1',
    // A presigned object-storage URL must never pass as protected content.
    'https://bucket.r2.cloudflarestorage.com/outputs/out-1.png?X-Amz-Signature=abc',
    // Protocol-relative and backslash tricks.
    '//attacker.example.test/v1/content/outputs/out-1',
    '/\\attacker.example.test/v1/content/outputs/out-1',
    '\\\\attacker.example.test/v1/content/outputs/out-1',
    // Credentials in URL.
    'http://user@localhost:8000/v1/content/outputs/out-1',
    'http://user:pass@localhost:8000/v1/content/outputs/out-1',
    // Query strings and fragments.
    '/v1/content/outputs/out-1?v=2',
    '/v1/content/outputs/out-1?',
    '/v1/content/outputs/out-1#frag',
    `${ORIGIN}/v1/content/outputs/out-1?X-Amz-Expires=60`,
    // Arbitrary or malformed paths masquerading as content.
    '/v1/users/me',
    '/v1/content/outputs/',
    '/v1/content/outputs',
    '/v1/content/jobs/out-1',
    '/v1/content/outputs/out-1/extra',
    '/v1/content/outputs/../uploads/out-1',
    '/v1/content/../users/me',
    '/v1/content/outputs/%2e%2e',
    '/v1/content/outputs/.hidden',
    'v1/content/outputs/out-1',
    ' /v1/content/outputs/out-1',
    '/v1/content/outputs/out-1 ',
    // Non-http schemes and non-canonical spellings.
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'blob:http://localhost:8000/uuid',
    'HTTP://LOCALHOST:8000/v1/content/outputs/out-1',
    'http://localhost:8000/v1/content/outputs/./out-1',
    '',
  ])('rejects %j', (value) => {
    expect(parseProtectedContentUrl(value)).toBeNull();
  });
});

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

describe('fetchProtectedContent', () => {
  beforeEach(() => {
    setAuth(
      {
        accessToken: 'access-token-that-must-not-leak',
        refreshToken: 'refresh-token',
        expiresAt: '2026-12-31T00:00:00Z',
        contentCookieExpiresAt: '2026-12-31T00:00:00Z',
      },
      profile,
    );
  });

  afterEach(() => {
    clearAuth();
    vi.unstubAllGlobals();
  });

  it('uses content-cookie credentials and never attaches the access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const target = parseProtectedContentUrl('/v1/content/outputs/out-1')!;

    await fetchProtectedContent(target);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/v1/content/outputs/out-1`);
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    const headers = new Headers(init.headers);
    expect(headers.has('authorization')).toBe(false);
    expect(JSON.stringify(init)).not.toContain('access-token-that-must-not-leak');
    if (import.meta.env.DEV) {
      expect(headers.get('x-product-id')).toBe(import.meta.env.VITE_PRODUCT_ID || 'vex');
    } else {
      expect(headers.has('x-product-id')).toBe(false);
    }
  });

  it('passes through the caller cache mode and abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await fetchProtectedContent(parseProtectedContentUrl('/v1/content/uploads/up-1')!, {
      cache: 'default',
      signal: controller.signal,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.cache).toBe('default');
    expect(init.signal).toBe(controller.signal);
  });

  it('probes a validated URL with a single-byte cookie-only request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 206 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await probeProtectedContent(parseProtectedContentUrl('/v1/content/uploads/up-1')!, {
      signal: controller.signal,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/v1/content/uploads/up-1`);
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBe(controller.signal);
    const headers = new Headers(init.headers);
    expect(headers.get('range')).toBe('bytes=0-0');
    expect(headers.has('authorization')).toBe(false);
    expect(JSON.stringify(init)).not.toContain('access-token-that-must-not-leak');
  });
});
