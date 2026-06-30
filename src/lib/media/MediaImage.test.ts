import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MediaImage from './MediaImage.svelte';
import type { components } from '$lib/api/types';

type MediaObject = components['schemas']['MediaObject'];

const ORIGIN = 'http://localhost:8000';

function makeImageMedia(overrides: Partial<MediaObject> = {}): MediaObject {
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

describe('MediaImage', () => {
  it('renders an img with srcset containing 150w and 512w from variants', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('srcset')).toContain('150w');
    expect(img.getAttribute('srcset')).toContain('512w');
  });

  it('sets width and height from original for CLS box', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('width')).toBe('1024');
    expect(img.getAttribute('height')).toBe('768');
  });

  it('src is origin-prefixed original path', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('empty variants: no srcset, src = original', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia({ variants: [] }), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('srcset')).toBeNull();
    expect(img.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('on error: falls back to original src and removes srcset', async () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;

    expect(img.getAttribute('srcset')).not.toBeNull();

    await fireEvent.error(img);

    expect(img.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/orig`);
    expect(img.getAttribute('srcset')).toBeNull();
  });
});
