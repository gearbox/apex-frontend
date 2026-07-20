import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
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

  it('shows the uploads empty message with a Reset filters action (tab counts as an active filter)', () => {
    state.libraryItems = [];
    state.pageUrl = new URL('http://localhost/app/library?source=upload');
    render(Page);
    expect(screen.getByText('No uploads yet')).toBeTruthy();
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

describe('/app/library page — GroupSheet "Details" round-trips to AssetDetailsSheet', () => {
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

  it('opens the details sheet for the selected output when "Details" is clicked in the group sheet', async () => {
    const groupItem = makeLibraryAssetItem({
      asset_ref: 'output:group-cover',
      job_id: 'job_abc',
      output_count: 2,
    });
    state.libraryItems = [groupItem];

    const output = makeLibraryOutputItem({ id: 'out_1', asset_ref: 'output:out_1' });
    state.groupDetailData = makeLibraryGroupDetail({ job_id: 'job_abc', outputs: [output] });
    state.assetDetailData = makeLibraryAssetDetail({
      asset_ref: 'output:out_1',
      display_title: 'Selected output',
    });

    render(Page);

    await fireEvent.click(screen.getByRole('button', { name: m.library_details_title() }));
    const detailsButton = await screen.findByLabelText(m.library_meta_details());
    await fireEvent.click(detailsButton);

    expect(await screen.findByRole('dialog', { name: m.library_details_title() })).toBeTruthy();
    expect(screen.getByText('Selected output')).toBeTruthy();
  });
});
