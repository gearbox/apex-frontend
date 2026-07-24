import { describe, it, expect } from 'vitest';
import { extensionForMedia, buildSaveFilename } from './filename';
import type { MediaObject } from './types';

function media(contentType: string, mediaType: MediaObject['media_type'] = 'image'): MediaObject {
  return {
    media_type: mediaType,
    original: { url: '/v1/content/outputs/x', content_type: contentType, size_bytes: 1024 },
    variants: [],
  };
}

describe('extensionForMedia', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
    ['video/mp4', 'mp4'],
    ['video/webm', 'webm'],
    ['video/quicktime', 'mov'],
  ])('maps %s to %s', (contentType, ext) => {
    expect(extensionForMedia(media(contentType))).toBe(ext);
  });

  it('falls back to mp4 for an unknown video content type', () => {
    expect(extensionForMedia(media('video/x-unknown', 'video'))).toBe('mp4');
  });

  it('falls back to jpg for an unknown image content type', () => {
    expect(extensionForMedia(media('image/x-unknown', 'image'))).toBe('jpg');
  });
});

describe('buildSaveFilename', () => {
  it('builds "<id>.<ext>" with no apex- prefix', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(buildSaveFilename(id, media('image/png'))).toBe(`${id}.png`);
  });

  it('sanitizes unexpected characters out of the id', () => {
    const filename = buildSaveFilename('abc/def id!', media('image/jpeg'));
    expect(filename).toBe('abcdefid.jpg');
  });

  it('keeps dots, underscores, and hyphens in the id', () => {
    const filename = buildSaveFilename('a1b2-c3d4_e5f6.7', media('image/jpeg'));
    expect(filename).toBe('a1b2-c3d4_e5f6.7.jpg');
  });
});
