import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { storageKeys, storageStatsQueryOptions } from './storage';

const BASE = 'http://localhost:8000';

describe('storageKeys', () => {
  it('generates a stable key for stats', () => {
    expect(storageKeys.stats()).toEqual(['storage', 'stats']);
  });

  it('all key is prefix of stats', () => {
    const [prefix] = storageKeys.all;
    expect(storageKeys.stats()[0]).toBe(prefix);
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
