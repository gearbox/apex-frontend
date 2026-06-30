import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Media from './Media.svelte';
import type { components } from '$lib/api/types';

type MediaObject = components['schemas']['MediaObject'];

function makeImageMedia(): MediaObject {
  return {
    media_type: 'image',
    original: {
      url: '/v1/content/outputs/img',
      width: 1024,
      height: 1024,
      content_type: 'image/png',
      size_bytes: 102400,
    },
    variants: [
      { label: 'sm', width: 150, height: 150, url: '/v1/content/outputs/img_sm' },
      { label: 'md', width: 512, height: 512, url: '/v1/content/outputs/img_md' },
    ],
  };
}

function makeVideoMedia(): MediaObject {
  return {
    media_type: 'video',
    original: {
      url: '/v1/content/outputs/vid',
      width: null,
      height: null,
      content_type: 'video/mp4',
      size_bytes: 5000000,
    },
    variants: [{ label: 'sm', width: 150, height: 84, url: '/v1/content/outputs/vid_poster_sm' }],
  };
}

describe('Media', () => {
  it('renders an img for media_type: image', () => {
    const { container } = render(Media, { props: { media: makeImageMedia(), alt: 'test image' } });
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders a video for media_type: video', () => {
    const { container } = render(Media, { props: { media: makeVideoMedia() } });
    expect(container.querySelector('video')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
