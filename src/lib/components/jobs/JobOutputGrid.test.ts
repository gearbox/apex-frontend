import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import JobOutputGrid from './JobOutputGrid.svelte';
import type { components } from '$lib/api/types';

type JobOutputItem = components['schemas']['JobOutputItem'];

function makeOutput(overrides: Partial<JobOutputItem> = {}): JobOutputItem {
  return {
    id: `out-${Math.random().toString(36).slice(2)}`,
    url: 'https://example.com/output.jpg',
    content_type: 'image/jpeg',
    format: 'jpeg',
    size_bytes: 102400,
    output_index: 0,
    is_thumbnail: false,
    ...overrides,
  };
}

describe('JobOutputGrid thumbnail filtering', () => {
  it('renders all outputs for an image job (no is_thumbnail outputs)', () => {
    const outputs = [
      makeOutput({ output_index: 0, url: 'https://example.com/a.jpg' }),
      makeOutput({ output_index: 1, url: 'https://example.com/b.jpg' }),
    ];

    render(JobOutputGrid, { props: { outputs } });

    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('excludes is_thumbnail outputs (video poster frames) from the grid', () => {
    const outputs = [
      makeOutput({
        output_index: 0,
        url: 'https://example.com/video.mp4',
        content_type: 'video/mp4',
        is_thumbnail: false,
      }),
      makeOutput({ output_index: 1, url: 'https://example.com/poster.jpg', is_thumbnail: true }),
    ];

    const { container } = render(JobOutputGrid, { props: { outputs } });

    // Only the video output is shown; the poster thumbnail is excluded
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('renders nothing when all outputs are is_thumbnail', () => {
    const outputs = [makeOutput({ is_thumbnail: true })];

    const { container } = render(JobOutputGrid, { props: { outputs } });

    expect(container.querySelector('.grid')).toBeNull();
  });
});
