import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import MediaVideo from './MediaVideo.svelte';
import { installMediaElementStubs } from './testing/mediaElementStubs';
import {
  __noteContentCredentialsRecoveryForTesting,
  __resetContentCookieServiceForTesting,
} from '$lib/services/contentCookie';
import type { components } from '$lib/api/types';
import type { ContentAccessRecovery } from '$lib/media/contentAccessRecovery';

const { recoverContentAccessMock } = vi.hoisted(() => ({
  recoverContentAccessMock: vi.fn<() => Promise<ContentAccessRecovery>>(),
}));

vi.mock('$lib/media/contentAccessRecovery', () => ({
  recoverContentAccess: recoverContentAccessMock,
}));

type MediaObject = components['schemas']['MediaObject'];

const ORIGIN = 'http://localhost:8000';

let restoreMediaElementStubs: () => void;

beforeAll(() => {
  restoreMediaElementStubs = installMediaElementStubs();
});

afterAll(() => {
  restoreMediaElementStubs();
});

beforeEach(() => {
  __resetContentCookieServiceForTesting();
  recoverContentAccessMock.mockReset().mockResolvedValue({ ok: true, via: 'remint' });
});

const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

function setMediaError(video: HTMLVideoElement, code: number | null): void {
  Object.defineProperty(video, 'error', {
    configurable: true,
    value: code === null ? null : ({ code } as MediaError),
  });
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

  it('defaults to metadata preload while allowing grid callers to disable byte loading', () => {
    const { container, rerender } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    expect(container.querySelector('video')?.getAttribute('preload')).toBe('metadata');

    rerender({ media: makeVideoMedia(), preload: 'none' });
    expect(container.querySelector('video')?.getAttribute('preload')).toBe('none');
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

  it('does not reload during its initial media mount', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    render(MediaVideo, { props: { media: makeVideoMedia() } });

    await tick();

    expect(load).not.toHaveBeenCalled();
    load.mockRestore();
  });

  it('reloads an errored element after content credentials recover', async () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'error', { configurable: true, value: {} as MediaError });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);

    __noteContentCredentialsRecoveryForTesting();
    await tick();

    expect(load).toHaveBeenCalledOnce();
  });

  it('reloads a preload-none element after content credentials recover', async () => {
    const { container } = render(MediaVideo, {
      props: { media: makeVideoMedia(), preload: 'none' },
    });
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'error', { configurable: true, value: null });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);

    __noteContentCredentialsRecoveryForTesting();
    await tick();

    expect(load).toHaveBeenCalledOnce();
  });

  it('does not interrupt healthy playback after content credentials recover', async () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'error', { configurable: true, value: null });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);

    __noteContentCredentialsRecoveryForTesting();
    await tick();

    expect(load).not.toHaveBeenCalled();
  });
});

describe('MediaVideo — one-shot content-access recovery on a native error', () => {
  it.each([MEDIA_ERR_NETWORK, MEDIA_ERR_SRC_NOT_SUPPORTED])(
    'error code %i recovers once and retries the exact same source',
    async (code) => {
      const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
      const video = container.querySelector('video')!;
      const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);
      setMediaError(video, code);

      await fireEvent.error(video);
      await flushMicrotasks();

      expect(recoverContentAccessMock).toHaveBeenCalledOnce();
      expect(load).toHaveBeenCalledOnce();
      expect(video.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/vid`);
    },
  );

  it('is bounded: a second error for the same URL never recovers again', async () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);
    setMediaError(video, MEDIA_ERR_SRC_NOT_SUPPORTED);

    await fireEvent.error(video);
    await flushMicrotasks();
    await fireEvent.error(video);
    await fireEvent.error(video);
    await flushMicrotasks();

    expect(recoverContentAccessMock).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
  });

  it.each([MEDIA_ERR_DECODE, MEDIA_ERR_ABORTED])(
    'error code %i is never treated as a credential failure',
    async (code) => {
      const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
      const video = container.querySelector('video')!;
      const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);
      setMediaError(video, code);

      await fireEvent.error(video);
      await flushMicrotasks();

      expect(recoverContentAccessMock).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
    },
  );

  it('does not reload when recovery fails', async () => {
    recoverContentAccessMock.mockResolvedValue({ ok: false, reason: 'transient' });
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);
    setMediaError(video, MEDIA_ERR_SRC_NOT_SUPPORTED);

    await fireEvent.error(video);
    await flushMicrotasks();

    expect(load).not.toHaveBeenCalled();
  });

  it('a recovery that resolves after the media changed does not reload the new source', async () => {
    let resolveRecovery!: (value: ContentAccessRecovery) => void;
    recoverContentAccessMock.mockReturnValue(
      new Promise<ContentAccessRecovery>((resolve) => (resolveRecovery = resolve)),
    );
    const first = makeVideoMedia();
    const second = makeVideoMedia({
      original: { ...first.original, url: '/v1/content/outputs/b' },
    });
    const { container, rerender } = render(MediaVideo, { props: { media: first } });
    const video = container.querySelector('video')!;
    const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);
    setMediaError(video, MEDIA_ERR_SRC_NOT_SUPPORTED);

    await fireEvent.error(video);
    await rerender({ media: second });
    resolveRecovery({ ok: true, via: 'remint' });
    await flushMicrotasks();

    expect(load).not.toHaveBeenCalled();
  });

  it('does not double-load when the background service already recovered the element', async () => {
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    // A real load() clears the error and starts re-fetching (readyState 0, NETWORK_LOADING).
    const load = vi.spyOn(video, 'load').mockImplementation(() => {
      setMediaError(video, null);
      Object.defineProperty(video, 'networkState', { configurable: true, value: 2 });
    });
    setMediaError(video, MEDIA_ERR_SRC_NOT_SUPPORTED);

    await fireEvent.error(video);
    __noteContentCredentialsRecoveryForTesting();
    await tick();
    await flushMicrotasks();

    expect(load).toHaveBeenCalledOnce();
  });

  it('does not double-load when the background service recovers first', async () => {
    let resolveRecovery!: (value: ContentAccessRecovery) => void;
    recoverContentAccessMock.mockReturnValue(
      new Promise<ContentAccessRecovery>((resolve) => (resolveRecovery = resolve)),
    );
    const { container } = render(MediaVideo, { props: { media: makeVideoMedia() } });
    const video = container.querySelector('video')!;
    const load = vi.spyOn(video, 'load').mockImplementation(() => {
      setMediaError(video, null);
      Object.defineProperty(video, 'networkState', { configurable: true, value: 2 });
    });
    setMediaError(video, MEDIA_ERR_SRC_NOT_SUPPORTED);

    await fireEvent.error(video);
    __noteContentCredentialsRecoveryForTesting();
    await tick();
    resolveRecovery({ ok: true, via: 'remint' });
    await flushMicrotasks();

    expect(load).toHaveBeenCalledOnce();
  });

  it('renders no source (and so issues no request) for a non-protected URL', async () => {
    const media = makeVideoMedia({
      original: { ...makeVideoMedia().original, url: 'https://cdn.example.com/leak.mp4' },
      variants: [],
    });
    const { container } = render(MediaVideo, { props: { media } });
    const video = container.querySelector('video')!;

    expect(video.hasAttribute('src')).toBe(false);
    setMediaError(video, MEDIA_ERR_SRC_NOT_SUPPORTED);
    await fireEvent.error(video);
    await flushMicrotasks();
    expect(recoverContentAccessMock).not.toHaveBeenCalled();
  });
});
