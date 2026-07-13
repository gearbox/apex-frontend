import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { generationStore } from '$lib/stores/generation';

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import ImageUpload from './ImageUpload.svelte';

beforeEach(() => {
  generationStore.reset();
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
});
