import { describe, expect, it } from 'vitest';
import {
  CONTENT_MEDIA_MAX_BYTES,
  matchesContentImageRoute,
  shouldCacheContentMedia,
} from './contentCachePolicy';

function mediaResponse(contentType: string, contentLength: string, status = 200): Response {
  return new Response('bytes', {
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
