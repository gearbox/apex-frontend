import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { jobsListQueryOptions } from './jobs';

const BASE = 'http://localhost:8000';

describe('jobsListQueryOptions — single type', () => {
  it('sends cursor and limit, not offset', async () => {
    let capturedUrl: URL | null = null;

    server.use(
      http.get(`${BASE}/v1/jobs`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ items: [], limit: 20, has_more: false, next_cursor: null });
      }),
    );

    const opts = jobsListQueryOptions({
      generation_type: 't2i',
      limit: 20,
      cursor: 'abc123',
    });
    await opts.queryFn();

    expect(capturedUrl).not.toBeNull();
    expect(capturedUrl!.searchParams.has('offset')).toBe(false);
    expect(capturedUrl!.searchParams.get('cursor')).toBe('abc123');
    expect(capturedUrl!.searchParams.get('limit')).toBe('20');
    expect(capturedUrl!.searchParams.get('generation_type')).toBe('t2i');
  });

  it('does not send offset when cursor is null', async () => {
    let capturedUrl: URL | null = null;

    server.use(
      http.get(`${BASE}/v1/jobs`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ items: [], limit: 20, has_more: false, next_cursor: null });
      }),
    );

    const opts = jobsListQueryOptions({ limit: 20, cursor: null });
    await opts.queryFn();

    expect(capturedUrl!.searchParams.has('offset')).toBe(false);
    expect(capturedUrl!.searchParams.has('cursor')).toBe(false);
  });
});

describe('jobsListQueryOptions — multi-type fan-out', () => {
  it('sends cursor-free requests for each type and does not send offset', async () => {
    const capturedUrls: URL[] = [];

    server.use(
      http.get(`${BASE}/v1/jobs`, ({ request }) => {
        capturedUrls.push(new URL(request.url));
        return HttpResponse.json({ items: [], limit: 10, has_more: false, next_cursor: null });
      }),
    );

    const opts = jobsListQueryOptions({ generation_type: ['t2i', 'i2i'], limit: 10 });
    await opts.queryFn();

    expect(capturedUrls).toHaveLength(2);
    for (const url of capturedUrls) {
      expect(url.searchParams.has('offset')).toBe(false);
    }
    const types = capturedUrls.map((u) => u.searchParams.get('generation_type')).sort();
    expect(types).toEqual(['i2i', 't2i']);
  });
});
