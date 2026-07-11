import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { components } from '$lib/api/types';

// jsdom has no IntersectionObserver; InfiniteScrollSentinel needs a stub to mount.
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

type ImageListItem = components['schemas']['ImageListItem'];

function makeUpload(overrides: Partial<ImageListItem> = {}): ImageListItem {
  return {
    id: 'upload_001',
    filename: 'sunset.jpg',
    created_at: '2026-01-01T00:00:00Z',
    expires_at: '2026-06-01T00:00:00Z',
    media: {
      media_type: 'image',
      original: {
        url: '/v1/content/uploads/upload_001',
        width: 1024,
        height: 768,
        content_type: 'image/jpeg',
        size_bytes: 500000,
      },
      variants: [],
    },
    ...overrides,
  };
}

let uploadItems: ImageListItem[] = [];

vi.mock('@tanstack/svelte-query', () => ({
  createInfiniteQuery: vi.fn((optionsFn: () => object) => {
    optionsFn();
    return {
      get data() {
        return { pages: [{ items: uploadItems, limit: 30, has_more: false, next_cursor: null }] };
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  }),
  createQuery: vi.fn((optionsFn: () => object) => {
    optionsFn();
    return {
      get data() {
        return { upload_count: uploadItems.length, output_count: 0, total_bytes: 0, total_mb: 0 };
      },
      isLoading: false,
    };
  }),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import Page from './+page.svelte';

beforeEach(() => {
  uploadItems = [makeUpload()];
});

describe('/app/uploads page', () => {
  it('renders grid items from query data', () => {
    render(Page);

    expect(screen.getByText('sunset.jpg')).toBeTruthy();
  });

  it('renders empty state when the list is empty', () => {
    uploadItems = [];
    render(Page);

    expect(screen.getByText('No uploads yet')).toBeTruthy();
    expect(screen.queryByText('sunset.jpg')).toBeNull();
  });
});
