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
import { makeGrokImageModelInfo } from '../../../mocks/factories/providers';
import type { SaveOutcome } from '$lib/media/save';

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
const onmutedchangeMock = vi.fn();
const onfullscreenchangeMock = vi.fn();

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn((optionsFn: () => { queryKey: readonly unknown[] }) => {
    const [scope, kind] = optionsFn().queryKey;
    if (scope === 'providers') {
      return {
        data: {
          providers: [
            {
              provider: 'grok',
              name: 'xAI Grok',
              available: true,
              provisioning_mode: 'always_on',
              models: [
                makeGrokImageModelInfo({ is_enabled: true, capabilities: ['t2i', 'i2i'] }),
                makeGrokImageModelInfo({
                  model_key: 'grok-imagine-video',
                  is_enabled: true,
                  capabilities: ['t2v', 'i2v', 'v2v'],
                }),
              ],
            },
          ],
          user_context: null,
        },
        isLoading: false,
        isError: false,
      };
    }
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
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
    ensureQueryData: vi.fn(() => Promise.resolve(detailData)),
  })),
}));

const { resolveSaveCapabilitiesMock, saveMediaMock } = vi.hoisted(() => ({
  resolveSaveCapabilitiesMock: vi.fn(() => ['download']),
  saveMediaMock: vi.fn<() => Promise<SaveOutcome>>(),
}));

vi.mock('$lib/media/save', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/media/save')>();
  return {
    ...actual,
    resolveSaveCapabilities: resolveSaveCapabilitiesMock,
    saveMedia: saveMediaMock,
  };
});

const { prewarmMediaMock, prewarmMediaWithSignalMock } = vi.hoisted(() => ({
  prewarmMediaMock: vi.fn(),
  prewarmMediaWithSignalMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('$lib/media/save/prewarm', () => ({
  prewarmMedia: prewarmMediaMock,
  prewarmMediaWithSignal: prewarmMediaWithSignalMock,
}));

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));

vi.mock('$app/navigation', () => ({ goto: gotoMock }));

import AssetDetailsSheet from './AssetDetailsSheet.svelte';

type AssetDetailsSheetTestProps = {
  assetRef: string;
  onclose?: () => void;
  startInRename?: boolean;
  startFrameExtraction?: boolean;
  jobIdHint?: string | null;
  onnavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  fullscreen?: boolean;
  onfullscreenchange?: (value: boolean) => void;
  muted?: boolean;
  onmutedchange?: (value: boolean) => void;
};

// `onclose`/`onfullscreenchange`/`onmutedchange` are all required props on AssetDetailsSheet;
// this centralises the boilerplate mocks so individual tests only spell out what they exercise.
function renderSheet(props: AssetDetailsSheetTestProps) {
  return render(AssetDetailsSheet, {
    props: {
      onclose: oncloseMock,
      onfullscreenchange: onfullscreenchangeMock,
      onmutedchange: onmutedchangeMock,
      ...props,
    },
  });
}

beforeEach(() => {
  mutateAsyncMock.mockClear();
  oncloseMock.mockClear();
  onmutedchangeMock.mockClear();
  onfullscreenchangeMock.mockClear();
  lineageQueryCalls = 0;
  groupData = undefined;
  resolveSaveCapabilitiesMock.mockReturnValue(['download']);
  saveMediaMock.mockReset().mockResolvedValue('shared');
  prewarmMediaMock.mockClear();
  prewarmMediaWithSignalMock.mockClear();
  gotoMock.mockReset().mockResolvedValue(undefined);
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

    renderSheet({ assetRef: 'output:b', jobIdHint: 'job-group' });

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

    const { container } = renderSheet({ assetRef: 'output:a', jobIdHint: 'job-group' });

    expect(container.querySelectorAll('video')).toHaveLength(1);
  });
});

describe('AssetDetailsSheet — video stage', () => {
  it('renders VideoStage (no native controls, app-owned control bar) instead of a bare MediaVideo', () => {
    const video = makeVideoMediaObject();
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc', media: video });
    const { container } = renderSheet({ assetRef: 'output:abc' });

    const videoEl = container.querySelector('video');
    expect(videoEl).not.toBeNull();
    expect(videoEl?.hasAttribute('controls')).toBe(false);
    expect(container.querySelector('[data-swipe-passthrough]')).not.toBeNull();
  });

  it('warms the viewer video once and aborts that warm when variation navigation changes media', async () => {
    const first = makeVideoMediaObject({
      original: {
        url: '/v1/content/outputs/first-video',
        width: null,
        height: null,
        content_type: 'video/mp4',
        size_bytes: 1024,
      },
    });
    const second = makeVideoMediaObject({
      original: {
        url: '/v1/content/outputs/second-video',
        width: null,
        height: null,
        content_type: 'video/mp4',
        size_bytes: 1024,
      },
    });
    detailData = makeLibraryAssetDetail({
      asset_ref: 'output:first',
      job_id: 'video-group',
      output_count: 2,
      media: first,
    });
    groupData = makeLibraryGroupDetail({
      job_id: 'video-group',
      outputs: [
        makeLibraryOutputItem({ id: 'first', asset_ref: 'output:first', media: first }),
        makeLibraryOutputItem({ id: 'second', asset_ref: 'output:second', media: second }),
      ],
    });

    renderSheet({ assetRef: 'output:first', jobIdHint: 'video-group' });
    await vi.waitFor(() => expect(prewarmMediaWithSignalMock).toHaveBeenCalledTimes(1));
    const calls = prewarmMediaWithSignalMock.mock.calls as unknown as Array<
      [unknown, { signal: AbortSignal; ttlMs: number }]
    >;
    const firstOptions = calls[0]![1];
    const firstSignal = firstOptions.signal;
    expect(firstOptions).toMatchObject({ ttlMs: 5 * 60_000 });

    await fireEvent.click(screen.getByRole('button', { name: 'Variation 2 of 2' }));

    await vi.waitFor(() => expect(prewarmMediaWithSignalMock).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
  });
});

describe('AssetDetailsSheet — video stage activity gating', () => {
  it('marks the inline stage inactive and the fullscreen stage active when fullscreen is open', () => {
    const video = makeVideoMediaObject();
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc', media: video });
    const { container } = renderSheet({ assetRef: 'output:abc', fullscreen: true });

    // Both stages stay mounted at once (see fix-video-stage-review.md D1) — one inline, one
    // in the fullscreen overlay — so exactly two <video> elements and two control bars exist.
    expect(container.querySelectorAll('video')).toHaveLength(2);

    // jsdom doesn't reflect the `inert` IDL property to an attribute (no getter/setter on
    // HTMLElement.prototype at all), even though Svelte always assigns it as a property — so
    // this asserts on the property, not `hasAttribute`, which would never see it here.
    const bars = container.querySelectorAll<HTMLElement & { inert: boolean }>(
      '[data-swipe-passthrough]',
    );
    expect(bars).toHaveLength(2);
    // Document order: the inline stage (inactive while fullscreen is open) renders first,
    // the fullscreen overlay stage (active) renders second.
    expect(bars[0].inert).toBe(true);
    expect(bars[1].inert).toBeFalsy();
  });

  it('marks the single (inline) stage active when fullscreen is closed', () => {
    const video = makeVideoMediaObject();
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc', media: video });
    const { container } = renderSheet({ assetRef: 'output:abc', fullscreen: false });

    expect(container.querySelectorAll('video')).toHaveLength(1);
    const bar = container.querySelector<HTMLElement & { inert: boolean }>(
      '[data-swipe-passthrough]',
    );
    expect(bar?.inert).toBeFalsy();
  });
});

describe('AssetDetailsSheet — keyboard: scrub range keeps native arrow semantics', () => {
  it('does not navigate on arrow keys targeting the scrub range, but Escape still closes', async () => {
    const video = makeVideoMediaObject();
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc', media: video });
    const onnavigate = vi.fn();
    const { container } = renderSheet({
      assetRef: 'output:abc',
      onnavigate,
      hasPrev: true,
      hasNext: true,
    });

    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range).not.toBeNull();

    await fireEvent.keyDown(range, { key: 'ArrowRight' });
    await fireEvent.keyDown(range, { key: 'ArrowLeft' });
    expect(onnavigate).not.toHaveBeenCalled();

    await fireEvent.keyDown(range, { key: 'Escape' });
    expect(oncloseMock).toHaveBeenCalledTimes(1);
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
    renderSheet({ assetRef: 'upload:abc' });

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
    renderSheet({ assetRef: 'output:abc' });

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
    renderSheet({ assetRef: 'upload:abc', startInRename: true });
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
    renderSheet({ assetRef: 'upload:abc' });

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
    renderSheet({ assetRef: 'output:abc' });

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
    renderSheet({ assetRef: 'output:abc' });

    expect(lineageQueryCalls).toBe(0);
    await fireEvent.click(screen.getByRole('button', { name: /Lineage/ }));
    expect(lineageQueryCalls).toBe(1);
  });
});

describe('AssetDetailsSheet — delete confirm', () => {
  it('opens a confirm dialog on delete and closes the sheet after confirming', async () => {
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc', available_actions: ['delete'] });
    renderSheet({ assetRef: 'output:abc' });

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
    const { container } = renderSheet({ assetRef: 'output:abc' });

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
    const first = renderSheet({ assetRef: 'output:abc' });

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(oncloseMock).toHaveBeenCalledOnce();
    first.unmount();

    oncloseMock.mockClear();
    renderSheet({ assetRef: 'output:abc' });
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(oncloseMock).toHaveBeenCalledOnce();
  });
});

describe('AssetDetailsSheet — save actions (share/download)', () => {
  it('renders a Share button alongside Download under a mobile capability stub', () => {
    resolveSaveCapabilitiesMock.mockReturnValue(['share', 'download']);
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc' });
    renderSheet({ assetRef: 'output:abc' });

    expect(screen.getByLabelText('Share')).toBeTruthy();
    expect(screen.getByLabelText('Download')).toBeTruthy();
  });

  it('renders only Download under a desktop capability stub', () => {
    resolveSaveCapabilitiesMock.mockReturnValue(['download']);
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc' });
    renderSheet({ assetRef: 'output:abc' });

    expect(screen.getByLabelText('Download')).toBeTruthy();
    expect(screen.queryByLabelText('Share')).toBeNull();
  });

  it('never renders Share as a quick-action menu pill — only via the dedicated save button', () => {
    resolveSaveCapabilitiesMock.mockReturnValue(['share', 'download']);
    detailData = makeLibraryAssetDetail({ asset_ref: 'output:abc' });
    renderSheet({ assetRef: 'output:abc' });

    // Remix still renders as a quick-action pill (plain text, no aria-label). Assert on
    // accessible *name* rather than aria-label alone, so a leak of 'share' into that
    // plain-text pill row (no aria-label, but a "Share" text node) would still be caught.
    expect(screen.getByText('Remix')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
  });

  it('omits both share and download when the download action is unavailable', () => {
    resolveSaveCapabilitiesMock.mockReturnValue(['share', 'download']);
    detailData = makeLibraryAssetDetail({
      asset_ref: 'output:abc',
      available_actions: ['remix', 'favorite', 'delete'],
    });
    renderSheet({ assetRef: 'output:abc' });

    expect(screen.queryByLabelText('Share')).toBeNull();
    expect(screen.queryByLabelText('Download')).toBeNull();
  });
});

describe('AssetDetailsSheet — navigation action pending state', () => {
  it('keeps all navigation actions locked until the route transition settles', async () => {
    let resolveNavigation: () => void;
    gotoMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveNavigation = resolve;
      }),
    );
    detailData = makeLibraryAssetDetail({
      asset_ref: 'output:323e4567-e89b-12d3-a456-426614174000',
      available_actions: ['remix', 'animate'],
    });
    renderSheet({ assetRef: 'output:323e4567-e89b-12d3-a456-426614174000' });

    const remixButton = screen.getByRole('button', { name: 'Remix' });
    const animateButton = screen.getByRole('button', { name: 'Animate' });
    await fireEvent.click(remixButton);
    await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledTimes(1));

    expect(remixButton.hasAttribute('disabled')).toBe(true);
    expect(animateButton.hasAttribute('disabled')).toBe(true);
    await fireEvent.click(animateButton);
    expect(gotoMock).toHaveBeenCalledTimes(1);

    resolveNavigation!();
    await vi.waitFor(() => expect(remixButton.hasAttribute('disabled')).toBe(false));
    expect(animateButton.hasAttribute('disabled')).toBe(false);
  });

  it('releases the navigation lock when navigation rejects', async () => {
    gotoMock.mockRejectedValue(new Error('navigation failed'));
    detailData = makeLibraryAssetDetail({
      asset_ref: 'output:323e4567-e89b-12d3-a456-426614174000',
      available_actions: ['remix'],
    });
    renderSheet({ assetRef: 'output:323e4567-e89b-12d3-a456-426614174000' });

    const remixButton = screen.getByRole('button', { name: 'Remix' });
    await fireEvent.click(remixButton);

    await vi.waitFor(() => expect(remixButton.hasAttribute('disabled')).toBe(false));
  });
});

describe('AssetDetailsSheet — save action pending state', () => {
  const SAVE_ASSET_REF = 'output:123e4567-e89b-12d3-a456-426614174000';

  it('disables the Share button and shows a spinner while the save promise is pending', async () => {
    let resolveSave: (outcome: SaveOutcome) => void;
    saveMediaMock.mockReturnValue(
      new Promise<SaveOutcome>((resolve) => {
        resolveSave = resolve;
      }),
    );
    resolveSaveCapabilitiesMock.mockReturnValue(['share', 'download']);
    detailData = makeLibraryAssetDetail({ asset_ref: SAVE_ASSET_REF });
    renderSheet({ assetRef: SAVE_ASSET_REF });

    const shareButton = screen.getByRole('button', { name: 'Share' });
    await fireEvent.click(shareButton);

    expect(shareButton.hasAttribute('disabled')).toBe(true);
    expect(shareButton.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status')).toBeTruthy();

    resolveSave!('shared');
    await vi.waitFor(() => expect(shareButton.hasAttribute('disabled')).toBe(false));
  });

  it('does not call saveMedia twice when the Share button is clicked again while pending', async () => {
    let resolveSave: (outcome: SaveOutcome) => void;
    saveMediaMock.mockReturnValue(
      new Promise<SaveOutcome>((resolve) => {
        resolveSave = resolve;
      }),
    );
    resolveSaveCapabilitiesMock.mockReturnValue(['share', 'download']);
    detailData = makeLibraryAssetDetail({ asset_ref: SAVE_ASSET_REF });
    renderSheet({ assetRef: SAVE_ASSET_REF });

    const shareButton = screen.getByRole('button', { name: 'Share' });
    await fireEvent.click(shareButton);
    // The button is disabled, but fire a second click directly regardless — the re-entrancy
    // guard lives in the controller, not just the `disabled` attribute.
    await fireEvent.click(shareButton);

    expect(saveMediaMock).toHaveBeenCalledTimes(1);
    resolveSave!('shared');
  });

  it('calls prewarmMedia on pointerdown, before the click fires', async () => {
    resolveSaveCapabilitiesMock.mockReturnValue(['share', 'download']);
    detailData = makeLibraryAssetDetail({ asset_ref: SAVE_ASSET_REF });
    renderSheet({ assetRef: SAVE_ASSET_REF });

    const shareButton = screen.getByRole('button', { name: 'Share' });
    await fireEvent.pointerDown(shareButton);

    expect(prewarmMediaMock).toHaveBeenCalledTimes(1);
  });

  it('does not prewarm on pointerdown for the Download button', async () => {
    resolveSaveCapabilitiesMock.mockReturnValue(['share', 'download']);
    detailData = makeLibraryAssetDetail({ asset_ref: SAVE_ASSET_REF });
    renderSheet({ assetRef: SAVE_ASSET_REF });

    const downloadButton = screen.getByRole('button', { name: 'Download' });
    await fireEvent.pointerDown(downloadButton);

    expect(prewarmMediaMock).not.toHaveBeenCalled();
  });
});
