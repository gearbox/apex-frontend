import { describe, expect, it, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import { makeModelInfo, generationModes } from '../../../mocks/factories/providers';
import { makeWanModelInfo } from '../../../mocks/fixtures/wan';
import VideoParams from './VideoParams.svelte';

describe('VideoParams', () => {
  beforeEach(() => generationStore.reset());

  it('renders live constraints and normalizes stale video state', async () => {
    generationStore.setVideoDuration(12);
    generationStore.setVideoResolution('720p');
    const { container } = render(VideoParams, {
      mode: 't2v',
      modelInfo: makeModelInfo({
        generation_modes: generationModes(['t2v']),
        image: null,
        video: {
          bills_input_video_seconds: false,
          min_duration: 1,
          supported_parameters: [],
          max_duration: 4,
          resolutions: ['480p'],
        },
      }),
    });

    await Promise.resolve();

    expect(container.querySelector('input[type="range"]')?.getAttribute('max')).toBe('4');
    expect(container.textContent).toContain('4s');
    expect(screen.getByRole('button', { name: '480p' })).toBeTruthy();
    expect(get(generationStore)).toMatchObject({ videoDuration: 4, videoResolution: '480p' });
  });
});

it('renders advertised video controls and tri-state values', async () => {
  generationStore.reset();
  render(VideoParams, { modelInfo: makeWanModelInfo(), mode: 'r2v' });
  await fireEvent.click(screen.getByRole('button', { name: '1080p' }));
  const off = screen.getAllByRole('button', { name: 'Off' });
  await fireEvent.click(off[0]);
  await fireEvent.click(screen.getByRole('button', { name: '16:9' }));
  expect(get(generationStore)).toMatchObject({
    videoResolution: '1080p',
    audio: false,
    videoAspectRatio: '16:9',
  });
  const seed = screen.getByRole('spinbutton');
  await fireEvent.input(seed, { target: { value: '0' } });
  expect(get(generationStore).videoSeed).toBe(0);
  await fireEvent.input(seed, { target: { value: '' } });
  expect(get(generationStore).videoSeed).toBeNull();
});
