import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import { makeModelInfo } from '../../../mocks/factories/providers';
import VideoParams from './VideoParams.svelte';

describe('VideoParams', () => {
  beforeEach(() => generationStore.reset());

  it('renders live constraints and normalizes stale video state', async () => {
    generationStore.setVideoDuration(12);
    generationStore.setVideoResolution('720p');
    const { container } = render(VideoParams, {
      modelInfo: makeModelInfo({
        capabilities: ['t2v'],
        image: null,
        video: { max_duration: 4, resolutions: ['480p'] },
      }),
    });

    await Promise.resolve();

    expect(container.querySelector('input[type="range"]')?.getAttribute('max')).toBe('4');
    expect(container.textContent).toContain('4s');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(get(generationStore)).toMatchObject({ videoDuration: 4, videoResolution: '480p' });
  });
});
