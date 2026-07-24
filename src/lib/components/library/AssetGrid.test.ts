import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { makeLibraryAssetDetail, makeLibraryAssetItem } from '../../../mocks/factories/library';
import { makeGrokImageModelInfo } from '../../../mocks/factories/providers';
import type { LibraryActionDeps } from './actions';
import AssetGrid from './AssetGrid.svelte';

const mutateMock = vi.fn();
const { saveMediaMock } = vi.hoisted(() => ({ saveMediaMock: vi.fn() }));

vi.mock('@tanstack/svelte-query', () => ({
  createMutation: vi.fn(() => ({
    mutate: mutateMock,
    get isPending() {
      return false;
    },
  })),
  useQueryClient: vi.fn(() => ({})),
}));

vi.mock('$lib/media/save', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/media/save')>();
  return {
    ...actual,
    saveMedia: saveMediaMock,
  };
});

const ALL_MODES = new Set(['t2i', 'i2i', 't2v', 'i2v', 'v2v', 'flf2v'] as const);

function makeDeps(overrides: Partial<LibraryActionDeps> = {}): LibraryActionDeps {
  return {
    providers: {
      providers: [
        {
          provider: 'grok',
          name: 'xAI Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            makeGrokImageModelInfo({
              model_key: 'grok-imagine-image',
              capabilities: ['t2i', 'i2i'],
            }),
            makeGrokImageModelInfo({
              model_key: 'grok-imagine-video',
              capabilities: ['t2v', 'i2v', 'v2v'],
              image: null,
            }),
          ],
        },
      ],
      user_context: null,
    },
    loadDetail: vi.fn(),
    ...overrides,
  };
}

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mutateMock.mockClear();
  saveMediaMock.mockReset().mockResolvedValue('downloaded');
});

describe('AssetGrid context-menu action serialization', () => {
  it('serializes navigation actions across cards until the first route transition settles', async () => {
    const first = makeLibraryAssetItem({
      asset_ref: 'output:323e4567-e89b-12d3-a456-426614174000',
      available_actions: ['remix'],
    });
    const second = makeLibraryAssetItem({
      asset_ref: 'output:423e4567-e89b-12d3-a456-426614174000',
      available_actions: ['remix'],
    });
    const details = new Map([
      [first.asset_ref, makeLibraryAssetDetail({ asset_ref: first.asset_ref, prompt: 'first' })],
      [second.asset_ref, makeLibraryAssetDetail({ asset_ref: second.asset_ref, prompt: 'second' })],
    ]);
    let resolveNavigation: () => void;
    const navigate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigation = resolve;
        }),
    );
    const actionDeps = makeDeps({
      navigate,
      loadDetail: vi.fn((assetRef: string) => Promise.resolve(details.get(assetRef)!)),
    });

    const { container } = render(AssetGrid, {
      props: {
        items: [first, second],
        onCardClick: vi.fn(),
        onCardDelete: vi.fn(),
        onLoadMore: vi.fn(),
        availableModes: ALL_MODES,
        actionDeps,
      },
    });
    const cards = container.querySelectorAll<HTMLElement>('.group[role="presentation"]');
    expect(cards).toHaveLength(2);

    await fireEvent.contextMenu(cards[0], { clientX: 10, clientY: 10 });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Remix' }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));

    await fireEvent.contextMenu(cards[0], { clientX: 10, clientY: 10 });
    const repeatedRemix = screen.getByRole('menuitem', { name: 'Remix' });
    expect(repeatedRemix.hasAttribute('disabled')).toBe(true);
    expect(repeatedRemix.getAttribute('aria-busy')).toBe('true');
    await fireEvent.click(repeatedRemix);
    expect(navigate).toHaveBeenCalledTimes(1);

    await fireEvent.click(document.body);
    await fireEvent.contextMenu(cards[1], { clientX: 10, clientY: 10 });
    const secondRemix = screen.getByRole('menuitem', { name: 'Remix' });
    expect(secondRemix.hasAttribute('disabled')).toBe(true);
    expect(secondRemix.getAttribute('aria-busy')).toBe('false');
    await fireEvent.click(secondRemix);
    expect(navigate).toHaveBeenCalledTimes(1);

    resolveNavigation!();
    await vi.waitFor(() => expect(secondRemix.hasAttribute('disabled')).toBe(false));
  });

  it('uses per-asset save keys so one card does not block another card download', async () => {
    const first = makeLibraryAssetItem({
      asset_ref: 'output:523e4567-e89b-12d3-a456-426614174000',
      available_actions: ['download'],
    });
    const second = makeLibraryAssetItem({
      asset_ref: 'output:623e4567-e89b-12d3-a456-426614174000',
      available_actions: ['download'],
    });
    let resolveSave: (outcome: 'downloaded') => void;
    saveMediaMock.mockReturnValue(
      new Promise<'downloaded'>((resolve) => {
        resolveSave = resolve;
      }),
    );

    const { container } = render(AssetGrid, {
      props: {
        items: [first, second],
        onCardClick: vi.fn(),
        onCardDelete: vi.fn(),
        onLoadMore: vi.fn(),
        availableModes: ALL_MODES,
        actionDeps: makeDeps(),
      },
    });
    const cards = container.querySelectorAll<HTMLElement>('.group[role="presentation"]');

    await fireEvent.contextMenu(cards[0], { clientX: 10, clientY: 10 });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Download' }));
    await vi.waitFor(() => expect(saveMediaMock).toHaveBeenCalledTimes(1));

    await fireEvent.contextMenu(cards[1], { clientX: 10, clientY: 10 });
    const secondDownload = screen.getByRole('menuitem', { name: 'Download' });
    expect(secondDownload.hasAttribute('disabled')).toBe(false);
    await fireEvent.click(secondDownload);
    expect(saveMediaMock).toHaveBeenCalledTimes(2);

    resolveSave!('downloaded');
    await vi.waitFor(() => expect(secondDownload.hasAttribute('disabled')).toBe(false));
  });
});
