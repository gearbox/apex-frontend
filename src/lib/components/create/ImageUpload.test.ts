import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import { activeProject } from '$lib/stores/activeProject.svelte';
import type { SourceMediaPolicy } from '$lib/utils/modelCapabilities';

const { invalidateQueries, uploadMediaMock, inheritProjectForUploadMock } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  uploadMediaMock: vi.fn(),
  inheritProjectForUploadMock: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock('$lib/api/upload', () => ({ uploadMedia: uploadMediaMock }));
vi.mock('$lib/services/projectInheritance', () => ({
  inheritProjectForUpload: inheritProjectForUploadMock,
}));

import ImageUpload from './ImageUpload.svelte';

const policy: SourceMediaPolicy = {
  accepted: true,
  required: true,
  min: 1,
  max: 2,
  mediaTypes: ['image'],
};

beforeEach(() => {
  vi.clearAllMocks();
  generationStore.reset();
  activeProject.reset();
});

describe('capability-driven source picker', () => {
  it('renders ordered selected sources and identifies the primary reference', () => {
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:one',
        mediaType: 'image',
        previewUrl: '/one.png',
        label: 'first',
        available: true,
      },
    ]);
    render(ImageUpload, { policy });
    expect(screen.getByText(/Primary/)).toBeTruthy();
  });

  it('writes upload:<uuid> source refs and assigns the completed upload to the active project', async () => {
    activeProject.set('project-1');
    uploadMediaMock.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      media: {
        media_type: 'image',
        original: { url: '/v1/content/uploads/one', content_type: 'image/jpeg', size_bytes: 1 },
        variants: [],
      },
    });
    const { container } = render(ImageUpload, { policy });
    const input = container.querySelector('input[type="file"]')!;
    await fireEvent.change(input, {
      target: { files: [new File(['image'], 'source.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(get(generationStore).sourceMedia).toHaveLength(1));
    expect(get(generationStore).sourceMedia[0].assetRef).toBe(
      'upload:11111111-1111-1111-1111-111111111111',
    );
    expect(inheritProjectForUploadMock).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'project-1',
    );
  });
});
