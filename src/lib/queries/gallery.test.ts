import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { QueryClient } from '@tanstack/svelte-query';
import { server } from '../../mocks/server';
import { galleryKeys, deleteContentMutationOptions } from './gallery';
import { storageKeys } from './storage';

const BASE = 'http://localhost:8000';

describe('galleryKeys', () => {
  it('generates stable keys for list', () => {
    expect(galleryKeys.list()).toEqual(['gallery', 'list', {}]);
  });

  it('generates stable keys for detail', () => {
    expect(galleryKeys.detail('job_123')).toEqual(['gallery', 'detail', 'job_123']);
  });

  it('all key is prefix of others', () => {
    const [prefix] = galleryKeys.all;
    expect(galleryKeys.list()[0]).toBe(prefix);
    expect(galleryKeys.detail('x')[0]).toBe(prefix);
  });
});

describe('deleteContentMutationOptions() — used for uploads and outputs', () => {
  it('on success invalidates gallery, storage (uploads + stats), jobs, and user keys', async () => {
    server.use(
      http.delete(`${BASE}/v1/content/:content_id`, () => new HttpResponse(null, { status: 204 })),
    );

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const opts = deleteContentMutationOptions(queryClient);

    await opts.mutationFn('upload_123');
    opts.onSuccess();

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(galleryKeys.all);
    // storageKeys.all (['storage']) is a prefix of both the uploads list key and the stats key
    expect(invalidatedKeys).toContainEqual(storageKeys.all);
    expect(invalidatedKeys).toContainEqual(['jobs']);
    expect(invalidatedKeys).toContainEqual(['user']);
  });

  it('surfaces the backend error message when deletion fails', async () => {
    server.use(
      http.delete(`${BASE}/v1/content/:content_id`, () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Content not found', status_code: 404 },
          { status: 404 },
        ),
      ),
    );

    const queryClient = new QueryClient();
    const opts = deleteContentMutationOptions(queryClient);

    await expect(opts.mutationFn('missing_upload')).rejects.toMatchObject({
      message: 'Content not found',
    });
  });
});
