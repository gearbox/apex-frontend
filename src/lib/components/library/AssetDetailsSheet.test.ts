import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { tick } from 'svelte';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import type { components } from '$lib/api/types';
import { makeLibraryAssetDetail, makeLibraryLineage } from '../../../mocks/factories/library';
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
let lineageQueryCalls = 0;
const mutateAsyncMock = vi.fn();
const renameMutateAsyncMock = vi.fn();
const deleteMutateAsyncMock = vi.fn();
const oncloseMock = vi.fn();

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn((optionsFn: () => { queryKey: readonly unknown[] }) => {
    const [, kind] = optionsFn().queryKey;
    if (kind === 'projects') {
      return {
        data: {
          items: [
            {
              id: 'project-one',
              name: 'Campaign',
              description: null,
              asset_count: 1,
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          ],
        },
        isLoading: false,
        isError: false,
      };
    }
    if (kind === 'lineage') {
      lineageQueryCalls += 1;
      return {
        data: {
          focus: {
            asset_ref: 'output:abc',
            source: 'output',
            media: makeMediaObject(),
            created_at: '2025-01-01T00:00:00Z',
            model: 'grok-imagine-image',
            generation_type: 't2i',
          },
          ancestors: [],
          descendants: [],
          descendant_totals: { job_count: 0, frame_count: 0 },
          ancestors_truncated: false,
          descendants_truncated: false,
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    }
    return {
      get data() {
        return detailData;
      },
      isLoading: false,
      isError: false,
    };
  }),
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
  lineageQueryCalls = 0;
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

describe('AssetDetailsSheet — project assignment', () => {
  it('assigns a project and sends null to unassign it', async () => {
    detailData = makeLibraryAssetDetail({ project_id: null, project_name: null });
    render(AssetDetailsSheet, { props: { assetRef: 'output:abc', onclose: oncloseMock } });

    await fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'project-one' } });
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      assetRef: 'output:abc',
      projectId: 'project-one',
    });

    await fireEvent.change(screen.getByLabelText('Project'), { target: { value: '' } });
    expect(mutateAsyncMock).toHaveBeenLastCalledWith({ assetRef: 'output:abc', projectId: null });
  });
});

describe('AssetDetailsSheet — lazy lineage', () => {
  it('does not create the lineage query until the section is expanded', async () => {
    detailData = makeLibraryAssetDetail({ lineage: makeLibraryLineage() });
    render(AssetDetailsSheet, {
      props: { assetRef: 'output:abc', onclose: oncloseMock, onNavigate: vi.fn() },
    });

    expect(lineageQueryCalls).toBe(0);
    await fireEvent.click(screen.getByRole('button', { name: /Lineage/ }));
    expect(lineageQueryCalls).toBe(1);
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

describe('AssetDetailsSheet — dismissal controls', () => {
  it('stays open after vertical swipes on the media and metadata panel', async () => {
    detailData = makeLibraryAssetDetail({ media: makeMediaObject() });
    const { container } = render(AssetDetailsSheet, {
      props: { assetRef: 'output:abc', onclose: oncloseMock },
    });

    const dialog = screen.getByRole('dialog', { name: 'Asset details' });
    const media = dialog.querySelector<HTMLElement>('.bg-black');
    const metadata = container.querySelector<HTMLElement>('.overflow-y-auto');
    if (!media || !metadata) throw new Error('Expected media and metadata panel to render');

    for (const target of [media, metadata]) {
      await fireEvent.touchStart(target, { touches: [{ clientX: 160, clientY: 120 }] });
      await fireEvent.touchMove(target, { touches: [{ clientX: 160, clientY: 360 }] });
      await fireEvent.touchEnd(target, { changedTouches: [{ clientX: 160, clientY: 360 }] });
    }

    expect(oncloseMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Asset details' })).toBeTruthy();
  });

  it('continues to close only through the close button or Escape', async () => {
    detailData = makeLibraryAssetDetail({ media: makeMediaObject() });
    const first = render(AssetDetailsSheet, {
      props: { assetRef: 'output:abc', onclose: oncloseMock },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(oncloseMock).toHaveBeenCalledOnce();
    first.unmount();

    oncloseMock.mockClear();
    render(AssetDetailsSheet, { props: { assetRef: 'output:abc', onclose: oncloseMock } });
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(oncloseMock).toHaveBeenCalledOnce();
  });
});
