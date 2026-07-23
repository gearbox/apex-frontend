import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { createQuery } from '@tanstack/svelte-query';
import * as m from '$paraglide/messages';
import type { components } from '$lib/api/types';
import {
  makeLibraryAssetItem,
  makeLibraryAssetDetail,
  makeLibraryGroupDetail,
  makeLibraryOutputItem,
} from '../../../../mocks/factories/library';

type LibraryAssetItem = components['schemas']['LibraryAssetItem'];
type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];

// jsdom has no IntersectionObserver; InfiniteScrollSentinel needs a stub to mount.
let observerCallback: IntersectionObserverCallback | null = null;
class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    observerCallback = cb;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const state = vi.hoisted(() => ({
  gotoMock: vi.fn(),
  pageUrl: new URL('http://localhost/app/library'),
  libraryItems: [] as LibraryAssetItem[],
  hasNextPage: false,
  fetchNextPageMock: vi.fn(),
  capturedListParams: undefined as unknown,
  assetDetailData: undefined as LibraryAssetDetail | undefined,
  groupDetailData: undefined as LibraryGroupDetail | undefined,
  tagItems: [] as Array<{ id: string; name: string; asset_count: number }>,
}));

vi.mock('$app/navigation', () => ({ goto: state.gotoMock }));

vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: { url: URL }) => void) => {
      fn({ url: state.pageUrl });
      return () => {};
    },
  },
}));

vi.mock('@tanstack/svelte-query', () => ({
  createInfiniteQuery: vi.fn((optionsFn: () => { queryKey: readonly unknown[] }) => {
    const opts = optionsFn();
    state.capturedListParams = opts.queryKey[2];
    return {
      get data() {
        return {
          pages: [
            {
              items: state.libraryItems,
              limit: 30,
              has_more: state.hasNextPage,
              next_cursor: null,
            },
          ],
        };
      },
      isLoading: false,
      isError: false,
      hasNextPage: state.hasNextPage,
      isFetchingNextPage: false,
      fetchNextPage: state.fetchNextPageMock,
      refetch: vi.fn(),
    };
  }),
  createQuery: vi.fn((optionsFn: () => { queryKey: readonly unknown[] }) => {
    const [scope, kind] = optionsFn().queryKey;
    if (scope === 'library' && kind === 'asset') {
      return {
        get data() {
          return state.assetDetailData;
        },
        isLoading: false,
        isError: false,
      };
    }
    if (scope === 'library' && kind === 'group') {
      return {
        get data() {
          return state.groupDetailData;
        },
        isLoading: false,
        isError: false,
      };
    }
    if (scope === 'library' && kind === 'tags') {
      return {
        get data() {
          return { items: state.tagItems };
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false };
  }),
  createMutation: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import Page from './+page.svelte';

beforeEach(() => {
  state.libraryItems = [makeLibraryAssetItem()];
  state.hasNextPage = false;
  state.pageUrl = new URL('http://localhost/app/library');
  state.gotoMock.mockClear();
  state.fetchNextPageMock.mockClear();
  state.capturedListParams = undefined;
  state.assetDetailData = undefined;
  state.groupDetailData = undefined;
  state.tagItems = [];
  observerCallback = null;
});

describe('/app/library page — tab and filter → URL param mapping', () => {
  it('defaults to the "all" tab with no source/favorite params', () => {
    render(Page);
    expect(state.capturedListParams).toMatchObject({ source: null, favorite: null });
  });

  it('clicking the Generated tab pushes ?source=output via goto', async () => {
    render(Page);
    const tab = screen.getByRole('tab', { name: 'Generated' });
    await fireEvent.click(tab);

    expect(state.gotoMock).toHaveBeenCalledWith(
      '?source=output',
      expect.objectContaining({ replaceState: true, keepFocus: true, noScroll: true }),
    );
  });

  it('clicking the Favorites tab pushes ?favorite=true via goto', async () => {
    render(Page);
    const tab = screen.getByRole('tab', { name: 'Favorites' });
    await fireEvent.click(tab);

    expect(state.gotoMock).toHaveBeenCalledWith(
      '?favorite=true',
      expect.objectContaining({ replaceState: true }),
    );
  });

  it('adds expiring to the current category URL without changing the active tab', async () => {
    state.pageUrl = new URL('http://localhost/app/library?source=upload');
    render(Page);

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Expiring' }));

    expect(screen.getByRole('tab', { name: 'Uploads' }).getAttribute('aria-selected')).toBe('true');
    expect(state.gotoMock).toHaveBeenCalledWith(
      '?source=upload&expiring=true',
      expect.objectContaining({ replaceState: true }),
    );
  });

  it('keeps Expiring enabled when a category tab is selected', async () => {
    state.pageUrl = new URL('http://localhost/app/library?expiring=true');
    render(Page);

    await fireEvent.click(screen.getByRole('tab', { name: 'Generated' }));

    expect(state.gotoMock).toHaveBeenCalledWith(
      '?expiring=true&source=output',
      expect.objectContaining({ replaceState: true }),
    );
  });

  it('removes expiring while preserving the current category', async () => {
    state.pageUrl = new URL('http://localhost/app/library?favorite=true&expiring=true');
    render(Page);

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Expiring' }));

    expect(state.gotoMock).toHaveBeenCalledWith(
      '?favorite=true',
      expect.objectContaining({ replaceState: true }),
    );
  });
});

describe('/app/library page — restoring filter state from the URL', () => {
  it('restores the Uploads tab and video media filter as active from ?source=upload&media=video', () => {
    state.pageUrl = new URL('http://localhost/app/library?source=upload&media=video');
    render(Page);

    expect(screen.getByRole('tab', { name: 'Uploads' }).getAttribute('aria-selected')).toBe('true');
    expect(state.capturedListParams).toMatchObject({ source: 'upload', media_type: 'video' });
  });

  it('restores project, server search, expiration, and sort from the URL', async () => {
    state.pageUrl = new URL(
      'http://localhost/app/library?project=project-1&query=mountain&expiring=true&sort=expiring_soon',
    );
    render(Page);
    await tick();

    expect(state.capturedListParams).toMatchObject({
      project_id: 'project-1',
      query: 'mountain',
      expiring: true,
      sort: 'expiring_soon',
    });
    expect((screen.getByLabelText('Search library') as HTMLInputElement).value).toBe('mountain');
    expect((screen.getByRole('checkbox', { name: 'Expiring' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('restores ?tag= into the API filter and round-trips tag selection through the URL', async () => {
    state.tagItems = [
      { id: 'tag-1', name: 'Portraits', asset_count: 3 },
      { id: 'tag-2', name: 'Favorites', asset_count: 1 },
    ];
    state.pageUrl = new URL('http://localhost/app/library?tag=tag-1');
    render(Page);

    expect(state.capturedListParams).toMatchObject({ tag_id: 'tag-1' });
    await fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 'tag-2' } });
    expect(state.gotoMock).toHaveBeenCalledWith(
      '?tag=tag-2',
      expect.objectContaining({ replaceState: true }),
    );
  });

  it('hides the tag control when the user has no tags', () => {
    render(Page);
    expect(screen.queryByLabelText('Filter by tag')).toBeNull();
  });
});

describe('/app/library page — server-side search', () => {
  it('debounces URL updates for 300ms and uses replaceState', async () => {
    vi.useFakeTimers();
    render(Page);

    await fireEvent.input(screen.getByLabelText('Search library'), { target: { value: 'nebula' } });
    expect(state.gotoMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(state.gotoMock).toHaveBeenCalledWith(
      '?query=nebula',
      expect.objectContaining({ replaceState: true }),
    );
    vi.useRealTimers();
  });

  it('shows the search-specific empty state', () => {
    state.libraryItems = [];
    state.pageUrl = new URL('http://localhost/app/library?query=missing');
    render(Page);

    expect(screen.getByText('No assets match your search')).toBeTruthy();
  });
});

describe('/app/library page — empty states per tab', () => {
  it('shows the "all" empty message with a Start creating link', () => {
    state.libraryItems = [];
    render(Page);
    expect(screen.getByText('Your library is empty. Create or upload something!')).toBeTruthy();
    expect(screen.getByText('Start creating')).toBeTruthy();
  });

  it('shows the favorites empty message with a Reset filters action', () => {
    state.libraryItems = [];
    state.pageUrl = new URL('http://localhost/app/library?favorite=true');
    render(Page);
    expect(screen.getByText('No favorites yet')).toBeTruthy();
    expect(screen.getByText('Reset filters')).toBeTruthy();
  });

  it('shows the expiring filtered empty state before category-only empty states', () => {
    state.libraryItems = [];
    state.pageUrl = new URL('http://localhost/app/library?favorite=true&expiring=true');
    render(Page);
    expect(screen.getByText('No expiring assets match the current filters')).toBeTruthy();
    expect(screen.getByText('Reset filters')).toBeTruthy();
  });

  it('shows the uploads empty message with a Reset filters action (tab counts as an active filter)', () => {
    state.libraryItems = [];
    state.pageUrl = new URL('http://localhost/app/library?source=upload');
    render(Page);
    expect(screen.getByText('No uploads yet')).toBeTruthy();
    expect(screen.getByText('Reset filters')).toBeTruthy();
  });

  it('shows the tag-specific empty state and a reset action', () => {
    state.libraryItems = [];
    state.pageUrl = new URL('http://localhost/app/library?tag=tag-1');
    render(Page);
    expect(screen.getByText('No assets with this tag')).toBeTruthy();
    expect(screen.getByText('Reset filters')).toBeTruthy();
  });
});

describe('/app/library page — infinite scroll', () => {
  it('calls fetchNextPage when the sentinel becomes visible and hasNextPage is true', () => {
    state.hasNextPage = true;
    render(Page);

    expect(observerCallback).not.toBeNull();
    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(state.fetchNextPageMock).toHaveBeenCalledTimes(1);
  });
});

describe('/app/library page — card menu rename opens the details sheet in rename mode', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true, // desktop — enables the card's right-click / overflow menu
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it('renaming from the card overflow menu opens AssetDetailsSheet already in rename mode', async () => {
    const item = makeLibraryAssetItem({
      asset_ref: 'output:abc-123',
      original_filename: 'photo.jpg',
      available_actions: ['rename', 'favorite', 'download', 'delete'],
    });
    state.libraryItems = [item];
    state.assetDetailData = makeLibraryAssetDetail({
      asset_ref: item.asset_ref,
      display_title: null,
      original_filename: 'photo.jpg',
      available_actions: ['rename', 'favorite', 'download', 'delete'],
    });

    const { container } = render(Page);
    const wrapper = container.querySelector('[role="presentation"]');
    expect(wrapper).not.toBeNull();
    await fireEvent.contextMenu(wrapper!, { clientX: 10, clientY: 10 });

    await fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    expect(await screen.findByDisplayValue('photo.jpg')).toBeTruthy();
  });
});

describe('/app/library page — unified variation viewer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it('opens the rich viewer directly for a multi-output card', async () => {
    const groupItem = makeLibraryAssetItem({
      asset_ref: 'output:group-cover',
      job_id: 'job_abc',
      output_count: 2,
    });
    state.libraryItems = [groupItem];

    const output = makeLibraryOutputItem({ id: 'out_1', asset_ref: groupItem.asset_ref });
    state.groupDetailData = makeLibraryGroupDetail({ job_id: 'job_abc', outputs: [output] });
    state.assetDetailData = makeLibraryAssetDetail({
      asset_ref: groupItem.asset_ref,
      display_title: 'Selected output',
    });

    render(Page);

    await fireEvent.click(screen.getByRole('button', { name: m.library_details_title() }));

    expect(await screen.findByRole('dialog', { name: m.library_details_title() })).toBeTruthy();
    expect(screen.getByText('Selected output')).toBeTruthy();
    expect(screen.queryByLabelText('Details')).toBeNull();
  });

  it('switches variations inside the mounted viewer rather than opening another grid card', async () => {
    const firstVariation = makeLibraryAssetItem({
      asset_ref: 'output:first',
      display_title: 'Variation one',
      job_id: 'job_abc',
      output_count: 2,
    });
    const secondVariation = makeLibraryAssetItem({
      asset_ref: 'output:second',
      display_title: 'Variation two',
      job_id: 'job_abc',
      output_count: 2,
    });
    state.libraryItems = [firstVariation, secondVariation];
    state.groupDetailData = makeLibraryGroupDetail({
      job_id: 'job_abc',
      prompt: 'A pair of variations',
      outputs: [
        makeLibraryOutputItem({ id: 'first', asset_ref: firstVariation.asset_ref }),
        makeLibraryOutputItem({ id: 'second', asset_ref: secondVariation.asset_ref }),
      ],
    });
    state.assetDetailData = makeLibraryAssetDetail({
      asset_ref: firstVariation.asset_ref,
      display_title: 'Variation one',
      output_count: 2,
      job_id: 'job_abc',
    });

    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Variation one' }));
    const viewer = await screen.findByRole('dialog', { name: m.library_details_title() });
    await fireEvent.click(screen.getByRole('button', { name: 'Variation 2 of 2' }));

    expect(
      screen.getByRole('button', { name: 'Variation 2 of 2' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('dialog', { name: m.library_details_title() })).toBe(viewer);
  });
});

function makeGridItems(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeLibraryAssetItem({
      asset_ref: `output:grid-${i + 1}`,
      display_title: `Asset ${i + 1}`,
      job_id: null,
      output_count: 1,
    }),
  );
}

describe('/app/library page — grid prev/next navigation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it('clicking Next asset requests the following grid item’s detail and hides Prev on the first item', async () => {
    const items = makeGridItems(3);
    state.libraryItems = items;
    state.assetDetailData = makeLibraryAssetDetail({ asset_ref: items[0].asset_ref });

    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Asset 1' }));
    await screen.findByRole('dialog', { name: m.library_details_title() });

    expect(screen.queryByLabelText('Previous asset')).toBeNull();

    vi.mocked(createQuery).mockClear();
    await fireEvent.click(screen.getByLabelText('Next asset'));

    const requestedKeys = vi.mocked(createQuery).mock.calls.map((call) => call[0]().queryKey);
    expect(requestedKeys).toContainEqual(['library', 'asset', items[1].asset_ref]);
  });

  it('hides Next asset on the last loaded item when there is no further page', async () => {
    const items = makeGridItems(2);
    state.libraryItems = items;
    state.hasNextPage = false;
    state.assetDetailData = makeLibraryAssetDetail({ asset_ref: items[1].asset_ref });

    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Asset 2' }));
    await screen.findByRole('dialog', { name: m.library_details_title() });

    expect(screen.queryByLabelText('Next asset')).toBeNull();
    expect(screen.getByLabelText('Previous asset')).toBeTruthy();
  });

  it('prefetches the next page once navigation nears the tail of the loaded items', async () => {
    const items = makeGridItems(5);
    state.libraryItems = items;
    state.hasNextPage = true;
    state.assetDetailData = makeLibraryAssetDetail({ asset_ref: items[0].asset_ref });

    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Asset 1' }));
    await screen.findByRole('dialog', { name: m.library_details_title() });

    // index 0 -> target 1; length(5) - 3 = 2, so 1 >= 2 is false: no prefetch yet.
    await fireEvent.click(screen.getByLabelText('Next asset'));
    expect(state.fetchNextPageMock).not.toHaveBeenCalled();

    // index 1 -> target 2; 2 >= 2 is true: prefetch fires.
    await fireEvent.click(await screen.findByLabelText('Next asset'));
    expect(state.fetchNextPageMock).toHaveBeenCalledTimes(1);
  });

  it('loads the next page and opens its first item in one click when Next is tapped on the tail item', async () => {
    const items = makeGridItems(2);
    state.libraryItems = items;
    state.hasNextPage = true;
    state.assetDetailData = makeLibraryAssetDetail({ asset_ref: items[1].asset_ref });

    const nextItem = makeLibraryAssetItem({
      asset_ref: 'output:grid-3',
      display_title: 'Asset 3',
      job_id: null,
      output_count: 1,
    });
    state.fetchNextPageMock.mockResolvedValue({
      data: {
        pages: [{ items: [...items, nextItem], limit: 30, has_more: false, next_cursor: null }],
      },
    });

    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Asset 2' }));
    await screen.findByRole('dialog', { name: m.library_details_title() });

    // Still on the last loaded item, but Next is shown because another page exists.
    expect(screen.getByLabelText('Next asset')).toBeTruthy();

    vi.mocked(createQuery).mockClear();
    await fireEvent.click(screen.getByLabelText('Next asset'));

    expect(state.fetchNextPageMock).toHaveBeenCalledTimes(1);
    const requestedKeys = vi.mocked(createQuery).mock.calls.map((call) => call[0]().queryKey);
    expect(requestedKeys).toContainEqual(['library', 'asset', 'output:grid-3']);
  });

  it('keeps fullscreen open across a Next navigation', async () => {
    const items = makeGridItems(2);
    state.libraryItems = items;
    state.assetDetailData = makeLibraryAssetDetail({ asset_ref: items[0].asset_ref });

    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Asset 1' }));
    await screen.findByRole('dialog', { name: m.library_details_title() });

    await fireEvent.click(screen.getByLabelText(m.library_fullscreen_open()));
    expect(screen.getByLabelText(m.library_fullscreen_close())).toBeTruthy();

    // The {#key} remounts the sheet for the new asset_ref; match the mocked detail so
    // stageMedia (and thus the fullscreen controls) render for the new selection too.
    state.assetDetailData = makeLibraryAssetDetail({ asset_ref: items[1].asset_ref });
    await fireEvent.click(screen.getByLabelText('Next asset'));
    expect(screen.getByLabelText(m.library_fullscreen_close())).toBeTruthy();
  });
});
