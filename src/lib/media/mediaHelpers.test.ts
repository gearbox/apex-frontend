import { describe, it, expect } from 'vitest';
import { imgAttrs, pickVariant, mediaFallbackSrc, posterSrc } from './mediaHelpers';
import type { components } from '$lib/api/types';

type MediaObject = components['schemas']['MediaObject'];

const ORIGIN = 'http://localhost:8000';

function makeMedia(overrides: Partial<MediaObject> = {}): MediaObject {
  return {
    media_type: 'image',
    original: {
      url: '/v1/content/outputs/orig',
      width: 1024,
      height: 768,
      content_type: 'image/png',
      size_bytes: 100000,
    },
    variants: [
      { label: 'sm', width: 150, height: 113, url: '/v1/content/outputs/orig_sm' },
      { label: 'md', width: 512, height: 384, url: '/v1/content/outputs/orig_md' },
    ],
    ...overrides,
  };
}

describe('imgAttrs', () => {
  it('builds srcset from variants with width descriptors', () => {
    const attrs = imgAttrs(makeMedia());
    expect(attrs.srcset).toBe(
      `${ORIGIN}/v1/content/outputs/orig_sm 150w, ${ORIGIN}/v1/content/outputs/orig_md 512w`,
    );
  });

  it('sets src to the original URL (origin-prefixed)', () => {
    const attrs = imgAttrs(makeMedia());
    expect(attrs.src).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('sets width and height from original', () => {
    const attrs = imgAttrs(makeMedia());
    expect(attrs.width).toBe(1024);
    expect(attrs.height).toBe(768);
  });

  it('omits srcset when variants is empty', () => {
    const attrs = imgAttrs(makeMedia({ variants: [] }));
    expect(attrs.srcset).toBeUndefined();
    expect(attrs.src).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('omits width/height when original dims are null', () => {
    const m = makeMedia({
      original: {
        url: '/v1/content/outputs/orig',
        width: null,
        height: null,
        content_type: 'image/png',
        size_bytes: 100,
      },
    });
    const attrs = imgAttrs(m);
    expect(attrs.width).toBeUndefined();
    expect(attrs.height).toBeUndefined();
  });

  it('passes through sizes when provided', () => {
    const attrs = imgAttrs(makeMedia(), '(max-width: 768px) 100vw, 50vw');
    expect(attrs.sizes).toBe('(max-width: 768px) 100vw, 50vw');
  });
});

describe('pickVariant', () => {
  it('returns the smallest variant whose width >= target', () => {
    const m = makeMedia();
    const v = pickVariant(m, 200);
    expect(v?.label).toBe('md');
    expect(v?.width).toBe(512);
  });

  it('returns the smallest variant when target is <= smallest width', () => {
    const v = pickVariant(makeMedia(), 100);
    expect(v?.label).toBe('sm');
  });

  it('returns the largest variant when all are smaller than target', () => {
    const v = pickVariant(makeMedia(), 2048);
    expect(v?.label).toBe('md');
    expect(v?.width).toBe(512);
  });

  it('returns undefined when variants is empty', () => {
    expect(pickVariant(makeMedia({ variants: [] }), 150)).toBeUndefined();
  });
});

describe('mediaFallbackSrc', () => {
  it('returns origin-prefixed original URL when variants is empty', () => {
    const src = mediaFallbackSrc(makeMedia({ variants: [] }));
    expect(src).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('returns smallest variant when no target given', () => {
    const src = mediaFallbackSrc(makeMedia());
    expect(src).toBe(`${ORIGIN}/v1/content/outputs/orig_sm`);
  });

  it('picks variant >= target when target given', () => {
    const src = mediaFallbackSrc(makeMedia(), 200);
    expect(src).toBe(`${ORIGIN}/v1/content/outputs/orig_md`);
  });

  it('falls back to original when target exceeds all variants', () => {
    const src = mediaFallbackSrc(makeMedia({ variants: [] }), 9999);
    expect(src).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });
});

describe('posterSrc', () => {
  it('prefers the ~512 variant as poster', () => {
    const src = posterSrc(makeMedia());
    expect(src).toBe(`${ORIGIN}/v1/content/outputs/orig_md`);
  });

  it('returns the only variant when there is just one', () => {
    const m = makeMedia({
      variants: [{ label: 'sm', width: 150, height: 113, url: '/v1/content/outputs/orig_sm' }],
    });
    expect(posterSrc(m)).toBe(`${ORIGIN}/v1/content/outputs/orig_sm`);
  });

  it('returns undefined when no variants', () => {
    expect(posterSrc(makeMedia({ variants: [] }))).toBeUndefined();
  });
});
