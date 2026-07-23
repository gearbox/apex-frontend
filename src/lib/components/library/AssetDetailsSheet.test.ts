import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { tick } from 'svelte';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import type { components } from '$lib/api/types';
import {
  makeLibraryAssetDetail,
  makeLibraryGroupDetail,
  makeLibraryLineage,
  makeLibraryOutputItem,
} from '../../../mocks/factories/library';
import { makeMediaObject, makeVideoMediaObject } from '../../../mocks/factories/media';

type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];

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
let groupData: LibraryGroupDetail | undefined;
let lineageQueryCalls = 0;
const mutateAsyncMock = vi.fn();
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
    if (kind === 'group') {
      return {
        get data() {
          return groupData;
        },
        isLoading: false,
        isError: false,
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
  oncloseMock.mockClear();
  lineageQueryCalls = 0;
  groupData = undefined;
});

describe('AssetDetailsSheet — unified variation selection', () => {
  it('keeps the clicked ref selected and removes stale controls while another detail loads', async () => {
    detailData = makeLibraryAssetDetail({
      asset_ref: 'output:b',
      display_title: 'Variation B',
      job_id: 'job-group',
      output_count: 3,
      available_actions: ['delete'],
    });
    groupData = makeLibraryGroupDetail({
      job_id: 'job-group',
      outputs: [
        makeLibraryOutputItem({ id: 'a', asset_ref: 'output:a', media: makeMediaObject() }),
        makeLibraryOutputItem({ id: 'b', asset_ref: 'output:b', media: makeMediaObject() }),
        makeLibraryOutputItem({ id: 'c', asset_ref: 'output:c', media: makeMediaObject() }),
      ],
    });

    render(AssetDetailsSheet, {
      props: { assetRef: 'output:b', jobIdHint: 'job-group', onclose: oncloseMock },
    });

    expect(
      screen.getByRole('button', { name: 'Variation 2 of 3' }).getAttribute('aria-pressed'),
    ).toBe('true');

    await fireEvent.click(screen.getByRole('button', { name: 'Variation 3 of 3' }));
    expect(
      screen.getByRole('button', { name: 'Variation 3 of 3' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByLabelText('Delete')).toBeNull();
  });

  it('mounts a video player only for the selected stage, not every variation thumbnail', () => {
    const video = makeVideoMediaObject();
    detailData = makeLibraryAssetDetail({
      asset_ref: 'output:a',
      job_id: 'job-group',
      output_count: 2,
      media: video,
    });
    groupData = makeLibraryGroupDetail({
      job_id: 'job-group',
      outputs: [
        makeLibraryOutputItem({ id: 'a', asset_ref: 'output:a', media: video }),
        makeLibraryOutputItem({ id: 'b', asset_ref: 'output:b', media: video }),
      ],
    });

    const { container } = render(AssetDetailsSheet, {
      props: { assetRef: 'output:a', jobIdHint: 'job-group', onclose: oncloseMock },
    });

    expect(container.querySelectorAll('video')).toHaveLength(1);
  });
});

describe('AssetDetailsSheet — conditional metadata sections', () => {
  it('shows the filename field for an uploaded asset and hides output-only fields', () => {
    detailData = makeLibraryAssetDetail({
      asset_ref: 'upload:abc',
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
      asset_ref: 'output:abc',
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
      asset_ref: 'upload:abc',
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
      asset_ref: 'upload:abc',
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
    detailData = makeLibraryAssetDetail({
      asset_ref: 'output:abc',
      project_id: null,
      project_name: null,
    });
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
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc', lineage: makeLibraryLineage() });
    render(AssetDetailsSheet, {
      props: { assetRef: 'output:abc', onclose: oncloseMock },
    });

    expect(lineageQueryCalls).toBe(0);
    await fireEvent.click(screen.getByRole('button', { name: /Lineage/ }));
    expect(lineageQueryCalls).toBe(1);
  });
});

describe('AssetDetailsSheet — delete confirm', () => {
  it('opens a confirm dialog on delete and closes the sheet after confirming', async () => {
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc', available_actions: ['delete'] });
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
