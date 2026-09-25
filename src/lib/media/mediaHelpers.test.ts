import { describe, it, expect } from 'vitest';
import {
  imgAttrs,
  pickVariant,
  mediaFallbackSrc,
  posterSrc,
  formatTimestampFromMs,
  formatTimestampFromSeconds,
} from './mediaHelpers';
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

  it('falls back to the valid original when the preferred target variant is invalid', () => {
    const src = mediaFallbackSrc(
      makeMedia({
        variants: [
          { label: 'md', width: 512, height: 384, url: 'https://cdn.example.com/bad.png' },
        ],
      }),
      512,
    );

    expect(src).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('skips an invalid first variant in favor of a later valid variant', () => {
    const src = mediaFallbackSrc(
      makeMedia({
        variants: [
          { label: 'sm', width: 150, height: 113, url: 'https://cdn.example.com/bad.png' },
          { label: 'md', width: 512, height: 384, url: '/v1/content/outputs/orig_md' },
        ],
      }),
    );

    expect(src).toBe(`${ORIGIN}/v1/content/outputs/orig_md`);
  });

  it('falls back to the original when every variant is invalid', () => {
    const src = mediaFallbackSrc(
      makeMedia({
        variants: [
          { label: 'sm', width: 150, height: 113, url: 'https://cdn.example.com/bad-sm.png' },
          { label: 'md', width: 512, height: 384, url: 'https://cdn.example.com/bad-md.png' },
        ],
      }),
    );

    expect(src).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('returns null when neither the variants nor original are protected content', () => {
    const src = mediaFallbackSrc(
      makeMedia({
        original: { ...makeMedia().original, url: 'https://cdn.example.com/bad-original.png' },
        variants: [
          { label: 'sm', width: 150, height: 113, url: 'https://cdn.example.com/bad-sm.png' },
        ],
      }),
    );

    expect(src).toBeNull();
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

  it('skips an invalid preferred poster variant for a valid alternate', () => {
    const video = makeMedia({
      media_type: 'video',
      original: { ...makeMedia().original, content_type: 'video/mp4' },
      variants: [
        { label: 'md', width: 512, height: 288, url: 'https://cdn.example.com/bad-poster.png' },
        { label: 'lg', width: 1024, height: 576, url: '/v1/content/outputs/valid-poster' },
      ],
    });

    expect(posterSrc(video)).toBe(`${ORIGIN}/v1/content/outputs/valid-poster`);
  });

  it('does not use a video original as a poster when every poster variant is invalid', () => {
    const video = makeMedia({
      media_type: 'video',
      original: { ...makeMedia().original, content_type: 'video/mp4' },
      variants: [
        { label: 'md', width: 512, height: 288, url: 'https://cdn.example.com/bad-poster.png' },
      ],
    });

    expect(posterSrc(video)).toBeUndefined();
  });
});

describe('formatTimestampFromMs', () => {
  it('formats zero as mm:ss.mmm', () => {
    expect(formatTimestampFromMs(0)).toBe('00:00.000');
  });

  it('formats minutes, seconds, and milliseconds', () => {
    expect(formatTimestampFromMs(65_432)).toBe('01:05.432');
  });

  it('clamps negative values to zero', () => {
    expect(formatTimestampFromMs(-500)).toBe('00:00.000');
  });

  it('returns a placeholder for NaN', () => {
    expect(formatTimestampFromMs(NaN)).toBe('--:--.---');
  });

  it('returns a placeholder for Infinity', () => {
    expect(formatTimestampFromMs(Infinity)).toBe('--:--.---');
  });

  it('returns a placeholder for -Infinity', () => {
    expect(formatTimestampFromMs(-Infinity)).toBe('--:--.---');
  });
});

describe('formatTimestampFromSeconds', () => {
  it('formats zero as mm:ss', () => {
    expect(formatTimestampFromSeconds(0)).toBe('00:00');
  });

  it('formats minutes and seconds, rounding to the nearest second', () => {
    expect(formatTimestampFromSeconds(65.6)).toBe('01:06');
  });

  it('clamps negative values to zero', () => {
    expect(formatTimestampFromSeconds(-5)).toBe('00:00');
  });

  it('returns a placeholder for NaN', () => {
    expect(formatTimestampFromSeconds(NaN)).toBe('--:--');
  });

  it('returns a placeholder for Infinity', () => {
    expect(formatTimestampFromSeconds(Infinity)).toBe('--:--');
  });

  it('returns a placeholder for -Infinity', () => {
    expect(formatTimestampFromSeconds(-Infinity)).toBe('--:--');
  });
});

describe('protected-content URL boundary', () => {
  const FOREIGN = 'https://cdn.example.com/image.png';

  it('imgAttrs has a null src and no request candidates for a foreign original', () => {
    const attrs = imgAttrs(
      makeMedia({ original: { ...makeMedia().original, url: FOREIGN }, variants: [] }),
    );
    expect(attrs.src).toBeNull();
    expect(attrs.srcset).toBeUndefined();
  });

  it('imgAttrs drops a foreign variant from srcset but keeps valid ones', () => {
    const attrs = imgAttrs(
      makeMedia({
        variants: [
          { label: 'sm', width: 150, height: 113, url: FOREIGN },
          { label: 'md', width: 512, height: 384, url: '/v1/content/outputs/orig_md' },
        ],
      }),
    );
    expect(attrs.srcset).toBe(`${ORIGIN}/v1/content/outputs/orig_md 512w`);
    expect(attrs.srcset).not.toContain('cdn.example.com');
  });

  it('mediaFallbackSrc returns null instead of a foreign URL', () => {
    expect(
      mediaFallbackSrc(
        makeMedia({ original: { ...makeMedia().original, url: FOREIGN }, variants: [] }),
      ),
    ).toBeNull();
  });

  it('posterSrc returns undefined for a foreign poster variant', () => {
    expect(
      posterSrc(makeMedia({ variants: [{ label: 'md', width: 512, height: 384, url: FOREIGN }] })),
    ).toBeUndefined();
  });
});
