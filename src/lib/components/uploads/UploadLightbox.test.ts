import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { components } from '$lib/api/types';

vi.mock('@tanstack/svelte-query', () => ({
  createMutation: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
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

import UploadLightbox from './UploadLightbox.svelte';

type ImageListItem = components['schemas']['ImageListItem'];

const videoUpload: ImageListItem = {
  id: 'upload-video-001',
  filename: 'clip.mp4',
  created_at: '2026-07-18T10:00:00.000Z',
  expires_at: '2026-08-18T10:00:00.000Z',
  media: {
    media_type: 'video',
    original: {
      url: '/v1/content/uploads/upload-video-001',
      width: 1920,
      height: 1080,
      content_type: 'video/mp4',
      size_bytes: 5_000_000,
    },
    variants: [],
  },
};

afterEach(() => cleanup());

describe('UploadLightbox frame extraction layering', () => {
  it('keeps the parent inert and ignores Escape/backdrop dismissal until the frame dialog closes', async () => {
    const onclose = vi.fn();
    render(UploadLightbox, { props: { item: videoUpload, onclose } });

    const parent = screen.getByRole('dialog', { name: 'Upload preview' });
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
