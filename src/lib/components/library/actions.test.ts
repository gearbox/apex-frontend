import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  filterVisibleLibraryActions,
  resolveLibraryAction,
  type LibraryAction,
  type LibraryActionAsset,
} from './actions';
import { SaveActivationError } from '$lib/media/save';
import { addToast } from '$lib/stores/toasts';

const { saveMediaMock } = vi.hoisted(() => ({
  saveMediaMock: vi.fn(),
}));

vi.mock('$lib/media/save', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/media/save')>();
  return {
    ...actual,
    saveMedia: saveMediaMock,
  };
});

vi.mock('$lib/stores/toasts', () => ({
  addToast: vi.fn(),
}));

describe('filterVisibleLibraryActions', () => {
  it('always removes create_variation, regardless of flf2v availability', () => {
    const actions: LibraryAction[] = ['remix', 'create_variation', 'favorite'];
    expect(
      filterVisibleLibraryActions(actions, { hasFlf2vModel: true, saveCapabilities: ['download'] }),
    ).toEqual(['remix', 'favorite']);
    expect(
      filterVisibleLibraryActions(actions, {
        hasFlf2vModel: false,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['remix', 'favorite']);
  });

  it('removes first/last-frame actions when no enabled model supports flf2v', () => {
    const actions: LibraryAction[] = [
      'remix',
      'use_as_first_frame',
      'use_as_last_frame',
      'favorite',
    ];
    expect(
      filterVisibleLibraryActions(actions, {
        hasFlf2vModel: false,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['remix', 'favorite']);
  });

  it('keeps first/last-frame actions when an enabled model supports flf2v', () => {
    const actions: LibraryAction[] = [
      'remix',
      'use_as_first_frame',
      'use_as_last_frame',
      'favorite',
    ];
    expect(
      filterVisibleLibraryActions(actions, { hasFlf2vModel: true, saveCapabilities: ['download'] }),
    ).toEqual(['remix', 'use_as_first_frame', 'use_as_last_frame', 'favorite']);
  });

  it('preserves the relative order of the remaining actions', () => {
    const actions: LibraryAction[] = [
      'favorite',
      'create_variation',
      'remix',
      'use_as_first_frame',
      'download',
      'delete',
    ];
    expect(
      filterVisibleLibraryActions(actions, {
        hasFlf2vModel: false,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['favorite', 'remix', 'download', 'delete']);
  });

  it('is a no-op for an already-clean action list', () => {
    const actions: LibraryAction[] = ['remix', 'favorite', 'download', 'delete'];
    expect(
      filterVisibleLibraryActions(actions, {
        hasFlf2vModel: false,
        saveCapabilities: ['download'],
      }),
    ).toEqual(actions);
  });

  it("expands download to ['share', 'download'] under an injected mobile capability set", () => {
    const actions: LibraryAction[] = ['favorite', 'download', 'delete'];
    expect(
      filterVisibleLibraryActions(actions, {
        hasFlf2vModel: false,
        saveCapabilities: ['share', 'download'],
      }),
    ).toEqual(['favorite', 'share', 'download', 'delete']);
  });

  it("expands download to ['download'] only under an injected desktop capability set", () => {
    const actions: LibraryAction[] = ['favorite', 'download', 'delete'];
    expect(
      filterVisibleLibraryActions(actions, {
        hasFlf2vModel: false,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['favorite', 'download', 'delete']);
  });
});

describe('resolveLibraryAction — share/download', () => {
  const asset: LibraryActionAsset = {
    asset_ref: 'output:123e4567-e89b-12d3-a456-426614174000',
    media: {
      media_type: 'image',
      original: {
        url: '/v1/content/outputs/123e4567-e89b-12d3-a456-426614174000',
        content_type: 'image/jpeg',
        size_bytes: 10,
      },
      variants: [],
    },
  };

  beforeEach(() => {
    saveMediaMock.mockReset();
    vi.mocked(addToast).mockClear();
  });

  it('produces no toast when the outcome is cancelled', async () => {
    saveMediaMock.mockResolvedValue('cancelled');
    await resolveLibraryAction('share', asset, {})?.();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('shows the retry toast when share fails on expired activation', async () => {
    saveMediaMock.mockRejectedValue(new SaveActivationError());
    await resolveLibraryAction('share', asset, {})?.();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  it('shows the generic error toast on any other save failure', async () => {
    saveMediaMock.mockRejectedValue(new Error('boom'));
    await resolveLibraryAction('download', asset, {})?.();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
