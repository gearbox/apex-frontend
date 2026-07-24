import { describe, expect, it } from 'vitest';
import { CONTENT_MEDIA_MAX_BYTES, shouldCacheContentMedia } from './contentCachePolicy';

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
