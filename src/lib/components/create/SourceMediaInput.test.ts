import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import { activeProject } from '$lib/stores/activeProject.svelte';
import { generationModes, makeModelInfo } from '../../../mocks/factories/providers';

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

import SourceMediaInput from './SourceMediaInput.svelte';

const modelInfo = makeModelInfo({
  generation_modes: generationModes(['t2i', 'i2i'], {
    i2i: { min: 1, max: 2, media_types: ['image'], roles: null },
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  generationStore.reset();
  activeProject.reset();
});

describe('source-driven source picker', () => {
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
    render(SourceMediaInput, { modelInfo });
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
    const { container } = render(SourceMediaInput, { modelInfo });
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

  it('hides the add controls once appending would exceed the advertised i2i cardinality', () => {
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:one',
        mediaType: 'image',
        previewUrl: '/one.png',
        label: 'first',
        available: true,
      },
      {
        assetRef: 'upload:two',
        mediaType: 'image',
        previewUrl: '/two.png',
        label: 'second',
        available: true,
      },
    ]);
    render(SourceMediaInput, { modelInfo });
    expect(screen.queryByRole('button', { name: /Library/i })).toBeNull();
  });

  it('shows a semantic warning and hides add controls for a source incompatible with the current model', () => {
    const t2iOnly = makeModelInfo({ generation_modes: generationModes(['t2i']) });
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:one',
        mediaType: 'image',
        previewUrl: '/one.png',
        label: 'first',
        available: true,
      },
    ]);
    render(SourceMediaInput, { modelInfo: t2iOnly });
    expect(screen.getByText('This model cannot use the current source media.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Choose from library/i })).toBeNull();
    // The retained, now-incompatible source stays visible and removable.
    expect(screen.getByLabelText(/Remove/)).toBeTruthy();
  });
});
