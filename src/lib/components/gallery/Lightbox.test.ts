import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { components } from '$lib/api/types';

const videoMedia = {
  media_type: 'video' as const,
  original: {
    url: '/v1/content/outputs/video-output-001',
    width: 1920,
    height: 1080,
    content_type: 'video/mp4',
    size_bytes: 5_000_000,
  },
  variants: [],
};

const detail = {
  job_id: 'video-job-001',
  badge: 'prompt' as const,
  input_media: null,
  prompt: 'A test video',
  negative_prompt: null,
  outputs: [
    {
      id: 'video-output-001',
      output_index: 0,
      created_at: '2026-07-18T10:00:00.000Z',
      media: videoMedia,
    },
  ],
  media_type: 'video' as const,
  model: 'grok-imagine-video',
  provider: 'grok',
  generation_type: 't2v',
  aspect_ratio: '16:9',
  token_cost: 1,
  created_at: '2026-07-18T10:00:00.000Z',
  completed_at: '2026-07-18T10:00:01.000Z',
  lineage: null,
};

vi.mock('@tanstack/svelte-query', () => ({
  createMutation: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  createQuery: vi.fn(() => ({ data: detail, isLoading: false, isError: false })),
  useQueryClient: vi.fn(() => ({})),
}));

vi.mock('$lib/utils/breakpoints', () => ({
  isDesktop: { subscribe: (subscriber: (value: boolean) => void) => (subscriber(false), () => {}) },
}));

vi.mock('$lib/components/frames/FrameExtractModal.svelte', async () => {
  const { default: FrameExtractModal } =
    await import('$lib/components/frames/FrameExtractModal.test-double.svelte');
  return { default: FrameExtractModal };
});

import Lightbox from './Lightbox.svelte';

type GalleryGridItem = components['schemas']['GalleryGridItem'];

const galleryItem: GalleryGridItem = {
  job_id: 'video-job-001',
  cover: videoMedia,
  badge: 'prompt',
  output_count: 1,
  generation_type: 't2v',
  model: 'grok-imagine-video',
  aspect_ratio: '16:9',
  prompt_snippet: 'A test video',
  created_at: '2026-07-18T10:00:00.000Z',
  expires_at: '2026-08-18T10:00:00.000Z',
};

afterEach(() => cleanup());

describe('Gallery Lightbox frame extraction layering', () => {
  it('keeps the parent inert and ignores Escape/backdrop dismissal until the frame dialog closes', async () => {
    const onclose = vi.fn();
    render(Lightbox, { props: { item: galleryItem, allItems: [galleryItem], onclose } });

    const parent = screen.getByRole('dialog', { name: 'Image lightbox' });
    const trigger = screen.getByRole('button', { name: 'Extract frames' });
    await fireEvent.click(trigger);

    expect((parent as HTMLElement & { inert?: boolean }).inert).toBe(true);
    expect(parent.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Frame extraction test double' })).toBeTruthy();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.click(parent);
    expect(onclose).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: 'Close frame extraction' }));
    await waitFor(() => expect((parent as HTMLElement & { inert?: boolean }).inert).not.toBe(true));
    expect(parent.hasAttribute('aria-hidden')).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(onclose).not.toHaveBeenCalled();

    await fireEvent.click(parent);
    expect(onclose).toHaveBeenCalledOnce();
  });
});
