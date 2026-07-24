import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import VideoStage from './VideoStage.svelte';
import { installMediaElementStubs } from './testing/mediaElementStubs';
import { makeVideoMediaObject } from '../../mocks/factories/media';

let restoreMediaElementStubs: () => void;

beforeAll(() => {
  restoreMediaElementStubs = installMediaElementStubs();
});

afterAll(() => {
  restoreMediaElementStubs();
});

/**
 * jsdom's `duration` getter is hardcoded to NaN with no setter (unlike `currentTime`, which
 * has both). This is a one-off local override rather than part of the shared media stub —
 * it's a different mechanism (property replacement, not an event-driven play/pause spy) and
 * only VideoStage's seek-range tests need it.
 */
function stubDuration(value: number): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration');
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get: () => value,
  });
  return () => {
    if (descriptor) Object.defineProperty(HTMLMediaElement.prototype, 'duration', descriptor);
    else Reflect.deleteProperty(HTMLMediaElement.prototype, 'duration');
  };
}

function baseProps(
  overrides: Partial<{
    muted: boolean;
    onmutedchange: (v: boolean) => void;
    active: boolean;
  }> = {},
) {
  return {
    media: makeVideoMediaObject(),
    muted: true,
    onmutedchange: vi.fn(),
    active: true,
    ...overrides,
  };
}

describe('VideoStage', () => {
  it('reflects the muted prop on the mute button', () => {
    render(VideoStage, { props: baseProps({ muted: true }) });
    expect(screen.getByLabelText('Unmute')).toBeTruthy();

    render(VideoStage, { props: baseProps({ muted: false }) });
    expect(screen.getByLabelText('Mute')).toBeTruthy();
  });

  it('calls onmutedchange with the toggled value when the mute button is clicked', async () => {
    const onmutedchange = vi.fn();
    render(VideoStage, { props: baseProps({ muted: true, onmutedchange }) });

    await fireEvent.click(screen.getByLabelText('Unmute'));
    expect(onmutedchange).toHaveBeenCalledWith(false);
  });

  it('shows Play while paused and switches to Pause once toggled', async () => {
    render(VideoStage, { props: baseProps() });

    expect(screen.getByLabelText('Play')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Play'));
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('resumes playback when unmuting while paused', async () => {
    const onmutedchange = vi.fn();
    render(VideoStage, { props: baseProps({ muted: true, onmutedchange }) });

    expect(screen.getByLabelText('Play')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Unmute'));

    expect(onmutedchange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('disables the scrub range until duration is known', () => {
    const { container } = render(VideoStage, { props: baseProps() });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;

    expect(range).not.toBeNull();
    expect(range.disabled).toBe(true);
  });

  it('marks the control bar as a swipe passthrough', () => {
    const { container } = render(VideoStage, { props: baseProps() });
    expect(container.querySelector('[data-swipe-passthrough]')).not.toBeNull();
  });

  it('does not stretch the video element to fill its container', () => {
    const { container } = render(VideoStage, { props: baseProps() });
    const video = container.querySelector('video')!;

    expect(video.classList.contains('w-full')).toBe(false);
    expect(video.classList.contains('h-full')).toBe(false);
    expect(video.classList.contains('max-w-full')).toBe(true);
    expect(video.classList.contains('max-h-full')).toBe(true);
  });

  describe('active gating', () => {
    it('mutes the underlying video regardless of the muted prop when inactive', () => {
      const { container } = render(VideoStage, {
        props: baseProps({ muted: false, active: false }),
      });
      const video = container.querySelector('video') as HTMLVideoElement;

      expect(video.muted).toBe(true);
    });

    it('force-pauses when the stage goes inactive', async () => {
      const { rerender } = render(VideoStage, { props: baseProps({ active: true }) });

      await fireEvent.click(screen.getByLabelText('Play'));
      expect(screen.getByLabelText('Pause')).toBeTruthy();

      await rerender(baseProps({ active: false }));
      expect(screen.getByLabelText('Play')).toBeTruthy();
    });

    it('marks the control bar inert when inactive, but not when active', () => {
      // jsdom doesn't reflect the `inert` IDL property to an attribute (no getter/setter on
      // HTMLElement.prototype at all), even though Svelte always assigns it as a property —
      // so this asserts on the property, not `hasAttribute`, which would never see it here.
      const inactive = render(VideoStage, { props: baseProps({ active: false }) });
      const inactiveBar = inactive.container.querySelector(
        '[data-swipe-passthrough]',
      ) as HTMLElement & { inert: boolean };
      expect(inactiveBar.inert).toBe(true);
      inactive.unmount();

      const active = render(VideoStage, { props: baseProps({ active: true }) });
      const activeBar = active.container.querySelector(
        '[data-swipe-passthrough]',
      ) as HTMLElement & {
        inert: boolean;
      };
      expect(activeBar.inert).toBeFalsy();
    });
  });

  describe('time readout', () => {
    it('shows a stable-width placeholder for duration before metadata loads', () => {
      render(VideoStage, { props: baseProps() });
      // currentTime starts at a valid 0 ("00:00"); duration is jsdom's default NaN, which
      // must render as the "--:--" placeholder rather than "NaN:NaN".
      expect(screen.getByText('00:00 / --:--')).toBeTruthy();
    });
  });

  describe('play() rejection', () => {
    it('restores the Play icon when play() is blocked or interrupted', async () => {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(
        new DOMException('blocked', 'NotAllowedError'),
      );
      render(VideoStage, { props: baseProps() });

      expect(screen.getByLabelText('Play')).toBeTruthy();
      await fireEvent.click(screen.getByLabelText('Play'));

      await waitFor(() => expect(screen.getByLabelText('Play')).toBeTruthy());
    });
  });

  describe('scrub drag latch', () => {
    it('holds the dragged value against an incoming currentTime update while scrubbing', async () => {
      const restoreDuration = stubDuration(100);
      try {
        const { container } = render(VideoStage, { props: baseProps() });
        const video = container.querySelector('video') as HTMLVideoElement;
        await fireEvent(video, new Event('durationchange'));

        const range = container.querySelector('input[type="range"]') as HTMLInputElement;
        expect(range.disabled).toBe(false);

        await fireEvent.keyDown(range, { key: 'ArrowRight' });
        await fireEvent.input(range, { target: { value: '42' } });
        expect(range.value).toBe('42');

        // Playback advances mid-drag and fires timeupdate — the thumb must not snap back.
        video.currentTime = 7;
        await fireEvent(video, new Event('timeupdate'));

        expect(range.value).toBe('42');
      } finally {
        restoreDuration();
      }
    });
  });
});
