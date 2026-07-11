import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeMediaObject } from '../../mocks/factories/gallery';
import { storageKeys, uploadsInfiniteQueryOptions, storageStatsQueryOptions } from './storage';

const BASE = 'http://localhost:8000';

describe('storageKeys', () => {
  it('generates stable keys for uploads', () => {
    expect(storageKeys.uploads()).toEqual(['storage', 'uploads', {}]);
  });

  it('generates a stable key for stats', () => {
    expect(storageKeys.stats()).toEqual(['storage', 'stats']);
  });

  it('all key is prefix of others', () => {
    const [prefix] = storageKeys.all;
    expect(storageKeys.uploads()[0]).toBe(prefix);
    expect(storageKeys.stats()[0]).toBe(prefix);
  });
});

describe('uploadsInfiniteQueryOptions() — pagination', () => {
  it('walks two pages via cursor and stops when has_more is false', async () => {
    server.use(
      http.get(`${BASE}/v1/storage/uploads`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('cursor') === 'cursor_page2') {
          return HttpResponse.json({
            items: [
              {
                id: 'upload_2',
                filename: 'b.jpg',
                created_at: '2026-01-02T00:00:00Z',
                expires_at: '2026-02-01T00:00:00Z',
                media: makeMediaObject(),
              },
            ],
            limit: 30,
            has_more: false,
            next_cursor: null,
          });
        }
        return HttpResponse.json({
          items: [
            {
              id: 'upload_1',
              filename: 'a.jpg',
              created_at: '2026-01-01T00:00:00Z',
              expires_at: '2026-02-01T00:00:00Z',
              media: makeMediaObject(),
            },
          ],
          limit: 30,
          has_more: true,
          next_cursor: 'cursor_page2',
        });
      }),
    );

    const opts = uploadsInfiniteQueryOptions();

    const page1 = await opts.queryFn({ pageParam: null });
    expect(page1.items.map((i) => i.id)).toEqual(['upload_1']);
    expect(opts.getNextPageParam(page1)).toBe('cursor_page2');

    const page2 = await opts.queryFn({ pageParam: opts.getNextPageParam(page1) as string });
    expect(page2.items.map((i) => i.id)).toEqual(['upload_2']);
    expect(opts.getNextPageParam(page2)).toBeUndefined();
  });
});

describe('storageStatsQueryOptions()', () => {
  it('returns the queryKey and a 60s staleTime', () => {
    const opts = storageStatsQueryOptions();
    expect(opts.queryKey).toEqual(['storage', 'stats']);
    expect(opts.staleTime).toBe(60 * 1000);
  });

  it('queryFn fetches storage stats from the API', async () => {
    server.use(
      http.get(`${BASE}/v1/storage/stats`, () =>
        HttpResponse.json({
          upload_count: 5,
          output_count: 12,
          total_bytes: 5242880,
          total_mb: 5,
        }),
      ),
    );

    const opts = storageStatsQueryOptions();
    const result = await opts.queryFn();
    expect(result).toEqual({
      upload_count: 5,
      output_count: 12,
      total_bytes: 5242880,
      total_mb: 5,
    });
  });
});
