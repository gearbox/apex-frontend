import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { tick } from 'svelte';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import type { components } from '$lib/api/types';
import { makeLibraryAssetDetail } from '../../../mocks/factories/library';
import { makeMediaObject } from '../../../mocks/factories/media';

type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

let detailData: LibraryAssetDetail | undefined;
const mutateAsyncMock = vi.fn();
const renameMutateAsyncMock = vi.fn();
const deleteMutateAsyncMock = vi.fn();
const oncloseMock = vi.fn();

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn(() => ({
    get data() {
      return detailData;
    },
    isLoading: false,
    isError: false,
  })),
  createMutation: vi.fn((optionsFn: () => { mutationFn: (v: unknown) => Promise<unknown> }) => {
    const opts = optionsFn();
    // Route all three mutations (favorite/rename/delete) through a generic mutateAsync
    // that also forwards to the real mutationFn so onSuccess/onError side effects run.
    return {
      mutate: (vars: unknown) => opts.mutationFn(vars),
      mutateAsync: async (vars: unknown) => {
        mutateAsyncMock(vars);
        return opts.mutationFn(vars);
      },
      isPending: false,
    };
  }),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import AssetDetailsSheet from './AssetDetailsSheet.svelte';

beforeEach(() => {
  mutateAsyncMock.mockClear();
  renameMutateAsyncMock.mockClear();
  deleteMutateAsyncMock.mockClear();
  oncloseMock.mockClear();
});

describe('AssetDetailsSheet — conditional metadata sections', () => {
  it('shows the filename field for an uploaded asset and hides output-only fields', () => {
    detailData = makeLibraryAssetDetail({
      source: 'upload',
      original_filename: 'vacation.jpg',
      model: null,
      provider: null,
      prompt: null,
    });
    render(AssetDetailsSheet, { props: { assetRef: 'upload:abc', onclose: oncloseMock } });

    // "vacation.jpg" appears twice: as the title and as the Filename metadata value.
    expect(screen.getAllByText('vacation.jpg').length).toBe(2);
    expect(screen.getByText('Filename')).toBeTruthy();
    expect(screen.queryByText('Model')).toBeNull();
    expect(screen.queryByText('Provider')).toBeNull();
  });

  it('shows model/provider/prompt fields for a generated asset and hides filename', () => {
    detailData = makeLibraryAssetDetail({
      source: 'output',
      model: 'grok-imagine-image',
      provider: 'grok',
      prompt: 'a cat astronaut',
    });
    render(AssetDetailsSheet, { props: { assetRef: 'output:abc', onclose: oncloseMock } });

    expect(screen.getByText('Model')).toBeTruthy();
    expect(screen.getByText('grok-imagine-image')).toBeTruthy();
    expect(screen.getByText('Provider')).toBeTruthy();
    expect(screen.getByText('a cat astronaut')).toBeTruthy();
    expect(screen.queryByText('Filename')).toBeNull();
  });
});

describe('AssetDetailsSheet — rename flow', () => {
  it('startInRename opens directly in rename mode once detail data is loaded', async () => {
    detailData = makeLibraryAssetDetail({
      display_title: null,
      original_filename: 'old-name.jpg',
      available_actions: ['rename', 'favorite', 'download', 'delete'],
    });
    render(AssetDetailsSheet, {
      props: { assetRef: 'upload:abc', onclose: oncloseMock, startInRename: true },
    });
    await tick();

    expect(screen.getByDisplayValue('old-name.jpg')).toBeTruthy();
  });

  it('submitting the rename form calls the rename mutation with the trimmed title', async () => {
    detailData = makeLibraryAssetDetail({
      display_title: null,
      original_filename: 'old-name.jpg',
      available_actions: ['rename', 'favorite', 'download', 'delete'],
    });
    render(AssetDetailsSheet, { props: { assetRef: 'upload:abc', onclose: oncloseMock } });

    await fireEvent.click(screen.getByLabelText('Rename'));
    const input = screen.getByDisplayValue('old-name.jpg');
    await fireEvent.input(input, { target: { value: '  New Name  ' } });
    await fireEvent.submit(input.closest('form')!);

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      assetRef: 'upload:abc',
      displayTitle: 'New Name',
    });
  });
});

describe('AssetDetailsSheet — delete confirm', () => {
  it('opens a confirm dialog on delete and closes the sheet after confirming', async () => {
    detailData = makeLibraryAssetDetail({ available_actions: ['delete'] });
    render(AssetDetailsSheet, { props: { assetRef: 'output:abc', onclose: oncloseMock } });

    await fireEvent.click(screen.getByLabelText('Delete'));
    const dialog = screen.getByRole('dialog', { name: 'Delete Asset' });
    expect(dialog).toBeTruthy();

    await fireEvent.click(within(dialog).getByText('Delete'));

    expect(mutateAsyncMock).toHaveBeenCalledWith('output:abc');
    await vi.waitFor(() => expect(oncloseMock).toHaveBeenCalledTimes(1));
  });
});

describe('AssetDetailsSheet — backdrop dismiss', () => {
  it('does not close when clicking inside the panel, only when clicking the backdrop itself', async () => {
    detailData = makeLibraryAssetDetail({ media: makeMediaObject() });
    const { container } = render(AssetDetailsSheet, {
      props: { assetRef: 'output:abc', onclose: oncloseMock },
    });

    const backdrop = container.querySelector('[role="dialog"][aria-label="Asset details"]');
    expect(backdrop).not.toBeNull();

    // Clicking a descendant (e.g. the metadata panel) must not bubble-dismiss the sheet.
    const panel = container.querySelector('.overflow-y-auto');
    if (panel) await fireEvent.click(panel);
    expect(oncloseMock).not.toHaveBeenCalled();

    // Clicking the backdrop element itself dismisses it.
    await fireEvent.click(backdrop!);
    expect(oncloseMock).toHaveBeenCalledTimes(1);
  });
});
