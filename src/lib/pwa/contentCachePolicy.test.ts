import { describe, expect, it } from 'vitest';
import {
  CONTENT_MEDIA_MAX_BYTES,
  matchesContentImageRoute,
  shouldCacheContentMedia,
} from './contentCachePolicy';

// The Fetch spec forbids a body on null-body statuses (204/205/304) — the Response
// constructor throws if one is supplied, so those statuses must pass `null` instead.
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

function mediaResponse(contentType: string, contentLength: string, status = 200): Response {
  return new Response(NULL_BODY_STATUSES.has(status) ? null : 'bytes', {
    status,
    headers: { 'content-type': contentType, 'content-length': contentLength },
  });
}

describe('content media cache policy', () => {
  it('accepts successful image variants strictly below 2 MB', () => {
    expect(shouldCacheContentMedia(mediaResponse('image/webp; charset=utf-8', '2097151'))).toBe(
      true,
    );
  });

  it.each([
    ['videos', mediaResponse('video/mp4', '1024')],
    ['errors', mediaResponse('image/webp', '1024', 401)],
    ['206 Partial Content (Range requests)', mediaResponse('image/webp', '1024', 206)],
    ['304 Not Modified (If-None-Match revalidation)', mediaResponse('image/webp', '1024', 304)],
    ['exactly 2 MB', mediaResponse('image/webp', String(CONTENT_MEDIA_MAX_BYTES))],
    [
      'missing lengths',
      new Response('bytes', { status: 200, headers: { 'content-type': 'image/webp' } }),
    ],
    ['invalid lengths', mediaResponse('image/webp', '2mb')],
  ])('rejects %s', (_label, response) => {
    expect(shouldCacheContentMedia(response)).toBe(false);
  });
});

describe('matchesContentImageRoute', () => {
  const apiOrigin = 'https://api.example.com';

  it('matches an <img>/srcset request against the content proxy', () => {
    expect(
      matchesContentImageRoute(
        {
          request: { destination: 'image' },
          url: new URL('https://api.example.com/v1/content/outputs/a'),
        },
        apiOrigin,
      ),
    ).toBe(true);
  });

  it.each([
    [
      'a <video> Range request',
      { destination: 'video' },
      'https://api.example.com/v1/content/outputs/a',
    ],
    [
      // fetch()-initiated requests (save/share, the progressive original stream) have an empty
      // destination — this is exactly what structurally excludes them from CacheFirst.
      'a fetch()-based request',
      { destination: '' },
      'https://api.example.com/v1/content/outputs/a',
    ],
    ['a foreign origin', { destination: 'image' }, 'https://cdn.example.com/v1/content/outputs/a'],
    ['a non-content path', { destination: 'image' }, 'https://api.example.com/v1/billing/pricing'],
  ])('rejects %s', (_label, request, url) => {
    expect(matchesContentImageRoute({ request, url: new URL(url) }, apiOrigin)).toBe(false);
  });
});
