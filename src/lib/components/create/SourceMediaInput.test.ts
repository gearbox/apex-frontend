import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { generationStore, type SourceMediaDraft } from '$lib/stores/generation';
import { activeProject } from '$lib/stores/activeProject.svelte';
import {
  generationModes,
  makeAishaVideoModelInfo,
  makeGrokVideoModelInfo,
  makeModelInfo,
} from '../../../mocks/factories/providers';

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
        role: null,
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
        role: null,
      },
      {
        assetRef: 'upload:two',
        mediaType: 'image',
        previewUrl: '/two.png',
        label: 'second',
        available: true,
        role: null,
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
        role: null,
      },
    ]);
    render(SourceMediaInput, { modelInfo: t2iOnly });
    expect(screen.getByText('This model cannot use the current source media.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Choose from library/i })).toBeNull();
    // The retained, now-incompatible source stays visible and removable.
    expect(screen.getByLabelText(/Remove/)).toBeTruthy();
  });

  it('P3.1: never renders an invalid "1 / 0" counter for a source-free model with a retained source', () => {
    const t2iOnly = makeModelInfo({ generation_modes: generationModes(['t2i']) });
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:one',
        mediaType: 'image',
        previewUrl: '/one.png',
        label: 'first',
        available: true,
        role: null,
      },
    ]);
    render(SourceMediaInput, { modelInfo: t2iOnly });
    expect(screen.queryByText(/\/\s*0/)).toBeNull();
  });

  it('P3.1: an incompatible retained video is never labelled "Source Image" nor "Remove image"', () => {
    const singleImageModel = makeModelInfo({
      generation_modes: generationModes(['t2i', 'i2i'], {
        i2i: { min: 1, max: 1, media_types: ['image'], roles: null },
      }),
    });
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:stale-video',
        mediaType: 'video',
        previewUrl: '/one.mp4',
        label: 'stale',
        available: true,
        role: null,
      },
    ]);
    render(SourceMediaInput, { modelInfo: singleImageModel });
    expect(screen.queryByText('Source Image')).toBeNull();
    expect(screen.getByText('Source Media')).toBeTruthy();
    expect(screen.queryByLabelText('Remove image')).toBeNull();
    expect(screen.getByLabelText('Remove source media')).toBeTruthy();
  });
});

describe('positional role slots (Phase 4)', () => {
  it('renders First frame / Last frame slots for Aisha Video, both empty, from an empty draft', () => {
    render(SourceMediaInput, { modelInfo: makeAishaVideoModelInfo() });
    expect(screen.getByText('First frame')).toBeTruthy();
    expect(screen.getByText('Last frame')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add first frame/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add last frame/i })).toBeTruthy();
  });

  it('does not render any role slots for a roleless (Grok-shaped) video model', () => {
    render(SourceMediaInput, { modelInfo: makeGrokVideoModelInfo() });
    expect(screen.queryByText('First frame')).toBeNull();
    expect(screen.queryByText('Last frame')).toBeNull();
  });

  it('renders a sparse draft correctly: last_frame filled, first_frame slot still offered', () => {
    const lastFrame: SourceMediaDraft = {
      assetRef: 'upload:last',
      mediaType: 'image',
      previewUrl: '/last.png',
      label: 'last',
      available: true,
      role: 'last_frame',
    };
    generationStore.setSourceMedia([lastFrame]);
    render(SourceMediaInput, { modelInfo: makeAishaVideoModelInfo() });
    expect(screen.getByRole('button', { name: /Add first frame/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add last frame/i })).toBeNull();
    expect(screen.getByText('last')).toBeTruthy();
  });

  it('renders both previews once first + last frame are filled, with no remaining Add buttons', () => {
    const firstFrame: SourceMediaDraft = {
      assetRef: 'upload:first',
      mediaType: 'image',
      previewUrl: '/first.png',
      label: 'first',
      available: true,
      role: 'first_frame',
    };
    const lastFrame: SourceMediaDraft = {
      assetRef: 'upload:last',
      mediaType: 'image',
      previewUrl: '/last.png',
      label: 'last',
      available: true,
      role: 'last_frame',
    };
    generationStore.setSourceMedia([firstFrame, lastFrame]);
    render(SourceMediaInput, { modelInfo: makeAishaVideoModelInfo() });
    expect(screen.getByText('first')).toBeTruthy();
    expect(screen.getByText('last')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add first frame/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add last frame/i })).toBeNull();
  });

  it('an unavailable role source shows Replace and preserves its role label', () => {
    const lastFrame: SourceMediaDraft = {
      assetRef: 'output:missing',
      mediaType: null,
      previewUrl: null,
      label: null,
      available: false,
      role: 'last_frame',
    };
    generationStore.setSourceMedia([lastFrame]);
    render(SourceMediaInput, { modelInfo: makeAishaVideoModelInfo() });
    expect(screen.getByText('Last frame')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy();
  });

  it('removing a role source acts on the correct position, leaving the other role intact', async () => {
    const firstFrame: SourceMediaDraft = {
      assetRef: 'upload:first',
      mediaType: 'image',
      previewUrl: '/first.png',
      label: 'first',
      available: true,
      role: 'first_frame',
    };
    const lastFrame: SourceMediaDraft = {
      assetRef: 'upload:last',
      mediaType: 'image',
      previewUrl: '/last.png',
      label: 'last',
      available: true,
      role: 'last_frame',
    };
    generationStore.setSourceMedia([firstFrame, lastFrame]);
    render(SourceMediaInput, { modelInfo: makeAishaVideoModelInfo() });
    await fireEvent.click(screen.getByLabelText('Remove first frame'));
    expect(get(generationStore).sourceMedia).toEqual([lastFrame]);
  });

  it('uploads directly into an empty role slot, tagging the resulting source with that role', async () => {
    uploadMediaMock.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      media: {
        media_type: 'image',
        original: { url: '/v1/content/uploads/first', content_type: 'image/jpeg', size_bytes: 1 },
        variants: [],
      },
    });
    const { container } = render(SourceMediaInput, { modelInfo: makeAishaVideoModelInfo() });
    await fireEvent.click(screen.getByRole('button', { name: /Add first frame/i }));
    const input = container.querySelector('input[type="file"]')!;
    await fireEvent.change(input, {
      target: { files: [new File(['image'], 'first.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(get(generationStore).sourceMedia).toHaveLength(1));
    expect(get(generationStore).sourceMedia[0]).toMatchObject({ role: 'first_frame' });
  });

  it('last frame can be filled before first frame, and first frame can be added afterward', async () => {
    uploadMediaMock
      .mockResolvedValueOnce({
        id: '22222222-2222-2222-2222-222222222222',
        media: {
          media_type: 'image',
          original: { url: '/v1/content/uploads/last', content_type: 'image/jpeg', size_bytes: 1 },
          variants: [],
        },
      })
      .mockResolvedValueOnce({
        id: '11111111-1111-1111-1111-111111111111',
        media: {
          media_type: 'image',
          original: { url: '/v1/content/uploads/first', content_type: 'image/jpeg', size_bytes: 1 },
          variants: [],
        },
      });
    const { container } = render(SourceMediaInput, { modelInfo: makeAishaVideoModelInfo() });
    const input = container.querySelector('input[type="file"]')!;

    await fireEvent.click(screen.getByRole('button', { name: /Add last frame/i }));
    await fireEvent.change(input, {
      target: { files: [new File(['image'], 'last.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(get(generationStore).sourceMedia).toHaveLength(1));
    expect(get(generationStore).sourceMedia[0]).toMatchObject({ role: 'last_frame' });

    await fireEvent.click(screen.getByRole('button', { name: /Add first frame/i }));
    await fireEvent.change(input, {
      target: { files: [new File(['image'], 'first.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(get(generationStore).sourceMedia).toHaveLength(2));
    const roles = get(generationStore).sourceMedia.map((s) => s.role);
    expect(new Set(roles)).toEqual(new Set(['first_frame', 'last_frame']));
  });
});
