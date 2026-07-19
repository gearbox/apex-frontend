import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { components } from '$lib/api/types';
import { makeLibraryAssetItem } from '../../../../mocks/factories/library';

type LibraryAssetItem = components['schemas']['LibraryAssetItem'];

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
  createQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  createMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
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
