import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/svelte';
import MediaVideo from './MediaVideo.svelte';
import type { components } from '$lib/api/types';

type MediaObject = components['schemas']['MediaObject'];

const ORIGIN = 'http://localhost:8000';

beforeAll(() => {
  // jsdom has no media playback pipeline; bind:paused invokes play()/pause() on the
  // underlying <video> whenever the bound value changes.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

function makeVideoMedia(overrides: Partial<MediaObject> = {}): MediaObject {
  return {
    media_type: 'video',
    original: {
      url: '/v1/content/outputs/vid',
      width: null,
      height: null,
      content_type: 'video/mp4',
      size_bytes: 5000000,
    },
    variants: [
      { label: 'sm', width: 150, height: 84, url: '/v1/content/outputs/vid_poster_sm' },
      { label: 'md', width: 512, height: 288, url: '/v1/content/outputs/vid_poster_md' },
    ],
    ...overrides,
  };
}

describe('MediaVideo', () => {
  it('renders a video element', () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('src is origin-prefixed original path', () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    expect(video.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/vid`);
  });

  it('poster resolves to the ~512 variant', () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    expect(video.getAttribute('poster')).toBe(`${ORIGIN}/v1/content/outputs/vid_poster_md`);
  });

  it('empty variants: no poster attribute', () => {
    const { container } = render(MediaVideo, {
      props: { media: makeVideoMedia({ variants: [] }) },
    });
    const video = container.querySelector('video')!;
    expect(video.getAttribute('poster')).toBeNull();
  });

  it('explicit poster prop overrides resolved poster', () => {
    const { container } = render(MediaVideo, {
      props: { media: makeVideoMedia(), poster: `${ORIGIN}/v1/content/custom_poster` },
    });
    const video = container.querySelector('video')!;
    expect(video.getAttribute('poster')).toBe(`${ORIGIN}/v1/content/custom_poster`);
  });

  it('controls attribute is absent when not passed', () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    expect(video.hasAttribute('controls')).toBe(false);
  });

  it('bindable media props (muted, paused, currentTime) default correctly', () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.muted).toBe(false);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(0);
  });

  it('keeps existing unbound call sites working (controls/autoplay/muted/loop/playsinline as plain props)', () => {
    const { container } = render(MediaVideo, {
      props: {
        media: makeVideoMedia(),
        controls: true,
        autoplay: true,
        muted: true,
        loop: true,
        playsinline: true,
      },
    });
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.playsInline).toBe(true);
  });
});
