import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import JobOutputGrid from './JobOutputGrid.svelte';
import type { components } from '$lib/api/types';

type JobOutputItem = components['schemas']['JobOutputItem'];
type MediaObject = components['schemas']['MediaObject'];

function makeImageMedia(url = '/v1/content/outputs/out.png'): MediaObject {
  return {
    media_type: 'image',
    original: { url, width: 1024, height: 1024, content_type: 'image/png', size_bytes: 102400 },
    variants: [
      { label: 'sm', width: 150, height: 150, url: `${url}_sm` },
      { label: 'md', width: 512, height: 512, url: `${url}_md` },
    ],
  };
}

function makeVideoMedia(url = '/v1/content/outputs/out.mp4'): MediaObject {
  return {
    media_type: 'video',
    original: { url, width: null, height: null, content_type: 'video/mp4', size_bytes: 5000000 },
    variants: [{ label: 'sm', width: 150, height: 84, url: `${url}_poster_sm` }],
  };
}

function makeOutput(overrides: Partial<JobOutputItem> = {}): JobOutputItem {
  return {
    id: `out-${Math.random().toString(36).slice(2)}`,
    output_index: 0,
    media: makeImageMedia(),
    ...overrides,
  };
}

describe('JobOutputGrid', () => {
  it('renders all image outputs as img elements', () => {
    const outputs = [
      makeOutput({ output_index: 0, media: makeImageMedia('/v1/content/outputs/a.png') }),
      makeOutput({ output_index: 1, media: makeImageMedia('/v1/content/outputs/b.png') }),
    ];

    render(JobOutputGrid, { props: { outputs } });

    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('renders video outputs as video elements', () => {
    const outputs = [
      makeOutput({ output_index: 0, media: makeVideoMedia('/v1/content/outputs/video.mp4') }),
    ];

    const { container } = render(JobOutputGrid, { props: { outputs } });

    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('renders nothing when outputs array is empty', () => {
    const { container } = render(JobOutputGrid, { props: { outputs: [] } });
    expect(container.querySelector('.grid')).toBeNull();
  });
});
