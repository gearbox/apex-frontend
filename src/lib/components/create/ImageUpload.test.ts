import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import { activeProject } from '$lib/stores/activeProject.svelte';

const { invalidateQueries, uploadMediaMock, inheritProjectForUploadMock } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  uploadMediaMock: vi.fn(),
  inheritProjectForUploadMock: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('$lib/api/upload', () => ({ uploadMedia: uploadMediaMock }));

vi.mock('$lib/services/projectInheritance', () => ({
  inheritProjectForUpload: inheritProjectForUploadMock,
}));

import ImageUpload from './ImageUpload.svelte';

beforeEach(() => {
  vi.clearAllMocks();
  generationStore.reset();
  activeProject.reset();
});

describe('ImageUpload', () => {
  it('displays an externally selected uploaded image with its supplied preview', async () => {
    generationStore.setUploadedImageId(
      'extracted-upload-1',
      'http://localhost:8000/v1/content/uploads/extracted-upload-1',
    );

    render(ImageUpload);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Selected' }).getAttribute('src')).toBe(
        'http://localhost:8000/v1/content/uploads/extracted-upload-1',
      );
    });
    expect(screen.getByText('From uploads')).toBeTruthy();
  });

  it('assigns a newly uploaded source image to the active project without blocking upload success', async () => {
    activeProject.set('project-1');
    uploadMediaMock.mockResolvedValue({
      id: 'upload-1',
      media: {
        media_type: 'image',
        original: {
          url: '/v1/content/uploads/upload-1',
          content_type: 'image/jpeg',
          size_bytes: 1,
        },
        variants: [],
      },
    });
    inheritProjectForUploadMock.mockRejectedValue(new Error('project assignment failed'));

    const { container } = render(ImageUpload);
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    await fireEvent.change(input!, {
      target: { files: [new File(['image'], 'source.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => {
      expect(inheritProjectForUploadMock).toHaveBeenCalledWith('upload-1', 'project-1');
    });
    expect(get(generationStore).uploadedImageId).toBe('upload-1');
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['library', 'projects'] });
  });
});
