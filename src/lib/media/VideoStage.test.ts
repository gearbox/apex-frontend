import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import VideoStage from './VideoStage.svelte';
import { makeVideoMediaObject } from '../../mocks/factories/media';

beforeAll(() => {
  // jsdom implements no media playback pipeline; bind:paused calls play()/pause() on the
  // underlying <video> whenever our local `paused` state changes.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

function baseProps(
  overrides: Partial<{ muted: boolean; onmutedchange: (v: boolean) => void }> = {},
) {
  return {
    media: makeVideoMediaObject(),
    muted: true,
    onmutedchange: vi.fn(),
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
});
