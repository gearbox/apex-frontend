import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { QueryClient } from '@tanstack/svelte-query';
import { server } from '../../mocks/server';
import { makeLibraryCursorPage, makeLibraryAssetDetail } from '../../mocks/factories/library';
import { storageKeys } from './storage';
import { ApiRequestError } from '$lib/api/errors';
import {
  libraryKeys,
  tagKeys,
  libraryListInfiniteQueryOptions,
  tagsListQueryOptions,
  libraryAssetQueryOptions,
  libraryGroupQueryOptions,
  favoriteMutationOptions,
  assetTagsMutationOptions,
  renameMutationOptions,
  renameTagMutationOptions,
  deleteAssetMutationOptions,
  bulkMutationOptions,
  bulkOffenderRefs,
  projectsListQueryOptions,
} from './library';

const BASE = 'http://localhost:8000';

describe('libraryKeys', () => {
  it('generates stable keys for list', () => {
    expect(libraryKeys.list()).toEqual(['library', 'list', {}]);
  });

  it('generates stable keys for asset and group', () => {
    expect(libraryKeys.asset('output:abc')).toEqual(['library', 'asset', 'output:abc']);
    expect(libraryKeys.group('job_123')).toEqual(['library', 'group', 'job_123']);
  });

  it('all key is a prefix of the others', () => {
    const [prefix] = libraryKeys.all;
    expect(libraryKeys.list()[0]).toBe(prefix);
    expect(libraryKeys.asset('x')[0]).toBe(prefix);
    expect(libraryKeys.group('x')[0]).toBe(prefix);
  });
});

describe('libraryListInfiniteQueryOptions() — cursor paging', () => {
  it('walks two pages via cursor and stops when has_more is false', async () => {
    server.use(
      http.get(`${BASE}/v1/library`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('cursor') === 'cursor_page2') {
          return HttpResponse.json(
            makeLibraryCursorPage(1, { asset_ref: 'output:page2_item' }, false),
          );
        }
        return HttpResponse.json({
          ...makeLibraryCursorPage(2, {}, true),
          next_cursor: 'cursor_page2',
        });
      }),
    );

    const opts = libraryListInfiniteQueryOptions();
    const page1 = await opts.queryFn({ pageParam: null });
    expect(page1.items.length).toBe(2);
    expect(opts.getNextPageParam(page1)).toBe('cursor_page2');

    const page2 = await opts.queryFn({ pageParam: opts.getNextPageParam(page1) as string });
    expect(page2.items.map((i) => i.asset_ref)).toEqual(['output:page2_item']);
    expect(opts.getNextPageParam(page2)).toBeUndefined();
  });

  it('passes through source, media_type, model, project, search, expiration, sort, and favorite filters as query params', async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${BASE}/v1/library`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json(makeLibraryCursorPage(0));
      }),
    );

    const opts = libraryListInfiniteQueryOptions({
      source: 'upload',
      media_type: 'image',
      model: 'grok-imagine-image',
      favorite: true,
      project_id: 'project-123',
      tag_id: 'tag-123',
      query: 'sunset beach',
      expiring: true,
      sort: 'expiring_soon',
    });
    await opts.queryFn({ pageParam: null });

    expect(capturedUrl?.searchParams.get('source')).toBe('upload');
    expect(capturedUrl?.searchParams.get('media_type')).toBe('image');
    expect(capturedUrl?.searchParams.get('model')).toBe('grok-imagine-image');
    expect(capturedUrl?.searchParams.get('favorite')).toBe('true');
    expect(capturedUrl?.searchParams.get('project_id')).toBe('project-123');
    expect(capturedUrl?.searchParams.get('tag_id')).toBe('tag-123');
    expect(capturedUrl?.searchParams.get('query')).toBe('sunset beach');
    expect(capturedUrl?.searchParams.get('expiring')).toBe('true');
    expect(capturedUrl?.searchParams.get('sort')).toBe('expiring_soon');
  });
});

describe('tagsListQueryOptions()', () => {
  it('aggregates tag cursor pages and exposes a stable tag query key', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      http.get(`${BASE}/v1/library/tags`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return HttpResponse.json(
          cursor
            ? {
                items: [
                  {
                    id: 'tag-2',
                    name: 'Second',
                    asset_count: 0,
                    created_at: '2025-06-01T12:00:00Z',
                    updated_at: '2025-06-01T12:00:00Z',
                  },
                ],
                limit: 50,
                has_more: false,
                next_cursor: null,
              }
            : {
                items: [
                  {
                    id: 'tag-1',
                    name: 'First',
                    asset_count: 1,
                    created_at: '2025-06-01T12:00:00Z',
                    updated_at: '2025-06-01T12:00:00Z',
                  },
                ],
                limit: 50,
                has_more: true,
                next_cursor: 'tag-page-2',
              },
        );
      }),
    );

    const result = await tagsListQueryOptions().queryFn();
    expect(cursors).toEqual([null, 'tag-page-2']);
    expect(result.items.map((tag) => tag.id)).toEqual(['tag-1', 'tag-2']);
    expect(tagKeys.list()).toEqual(['library', 'tags', 'list']);
  });

  it('aggregates a valid twelve-page tag cursor chain without truncating it', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      http.get(`${BASE}/v1/library/tags`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        const pageIndex = cursor ? Number(cursor.replace('tag-page-', '')) : 0;
        const isLastPage = pageIndex === 11;

        return HttpResponse.json({
          items: Array.from({ length: 50 }, (_, itemIndex) => ({
            id: `tag-${pageIndex * 50 + itemIndex}`,
            name: `Tag ${pageIndex * 50 + itemIndex}`,
            asset_count: itemIndex,
            created_at: '2025-06-01T12:00:00Z',
            updated_at: '2025-06-01T12:00:00Z',
          })),
          limit: 50,
          has_more: !isLastPage,
          next_cursor: isLastPage ? null : `tag-page-${pageIndex + 1}`,
        });
      }),
    );

    const result = await tagsListQueryOptions().queryFn();

    expect(cursors).toEqual([
      null,
      ...Array.from({ length: 11 }, (_, index) => `tag-page-${index + 1}`),
    ]);
    expect(result.items.map((tag) => tag.id)).toEqual(
      Array.from({ length: 600 }, (_, index) => `tag-${index}`),
    );
    expect(result.has_more).toBe(false);
    expect(result.next_cursor).toBeNull();
  });

  it('rejects a missing next cursor without issuing another request', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      http.get(`${BASE}/v1/library/tags`, ({ request }) => {
        cursors.push(new URL(request.url).searchParams.get('cursor'));
        return HttpResponse.json({
          items: [],
          limit: 50,
          has_more: true,
          next_cursor: null,
        });
      }),
    );

    await expect(tagsListQueryOptions().queryFn()).rejects.toMatchObject({
      error: 'invalid_pagination',
    });
    expect(cursors).toEqual([null]);
  });

  it('rejects a repeated cursor before issuing a third request', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      http.get(`${BASE}/v1/library/tags`, ({ request }) => {
        cursors.push(new URL(request.url).searchParams.get('cursor'));
        return HttpResponse.json({
          items: [],
          limit: 50,
          has_more: true,
          next_cursor: 'same-cursor',
        });
      }),
    );

    await expect(tagsListQueryOptions().queryFn()).rejects.toMatchObject({
      error: 'invalid_pagination',
    });
    expect(cursors).toEqual([null, 'same-cursor']);
  });
});

describe('bulkMutationOptions()', () => {
  it('sends tag operations through one bulk request and refreshes tag counts', async () => {
    let receivedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/library/assets/bulk`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(
          { op: 'add_tags', results: [], succeeded: 2, failed: 0 },
          { status: 201 },
        );
      }),
    );
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const options = bulkMutationOptions(queryClient);
    const variables = {
      type: 'add_tags' as const,
      assetRefs: ['output:one', 'upload:two'],
      tagIds: ['tag-a'],
    };

    await options.mutationFn(variables);
    options.onSettled();

    expect(receivedBody).toEqual({
      type: 'add_tags',
      asset_refs: variables.assetRefs,
      tag_ids: variables.tagIds,
    });
    expect(invalidateSpy.mock.calls.map((call) => call[0]?.queryKey)).toContainEqual(tagKeys.all);
  });
  it('POSTs one bulk body and optimistically removes every deleted ref from cached pages', async () => {
    let receivedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/library/assets/bulk`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(
          { op: 'delete', results: [], succeeded: 2, failed: 0 },
          { status: 201 },
        );
      }),
    );
    const queryClient = new QueryClient();
    const listKey = libraryKeys.list();
    queryClient.setQueryData(listKey, {
      pages: [makeLibraryCursorPage(2, {}, false)],
      pageParams: [null],
    });
    const refs = (
      queryClient.getQueryData(listKey) as { pages: { items: { asset_ref: string }[] }[] }
    ).pages[0].items.map((item) => item.asset_ref);
    const options = bulkMutationOptions(queryClient);

    const context = await options.onMutate({ type: 'delete', assetRefs: refs });
    const optimisticItems = (
      queryClient.getQueryData(listKey) as { pages: { items: { asset_ref: string }[] }[] }
    ).pages[0].items;
    expect(optimisticItems).toEqual([]);

    await options.mutationFn({ type: 'delete', assetRefs: refs });
    expect(receivedBody).toEqual({ type: 'delete', asset_refs: refs });
    options.onError(new Error('nope'), { type: 'delete', assetRefs: refs }, context);
    expect(
      (queryClient.getQueryData(listKey) as { pages: { items: { asset_ref: string }[] }[] })
        .pages[0].items,
    ).toHaveLength(2);
  });

  it('extracts backend offender refs from the 400 envelope', () => {
    expect(
      bulkOffenderRefs(
        new ApiRequestError({
          error: 'bulk_invalid',
          message: 'Invalid',
          status_code: 400,
          extra: { offending_refs: ['output:bad'] },
        }),
      ),
    ).toEqual(['output:bad']);
  });

  it('throws partial failures with failed refs and restores only failed optimistic deletes', async () => {
    server.use(
      http.post(`${BASE}/v1/library/assets/bulk`, () =>
        HttpResponse.json({
          op: 'delete',
          results: [
            { asset_ref: 'output:out_mock_001', success: true },
            { asset_ref: 'output:out_mock_002', success: false },
          ],
          succeeded: 1,
          failed: 1,
        }),
      ),
    );

    const queryClient = new QueryClient();
    const listKey = libraryKeys.list();
    queryClient.setQueryData(listKey, {
      pages: [makeLibraryCursorPage(2, {}, false)],
      pageParams: [null],
    });
    const options = bulkMutationOptions(queryClient);
    const variables = {
      type: 'delete' as const,
      assetRefs: ['output:out_mock_001', 'output:out_mock_002'],
    };
    const context = await options.onMutate(variables);

    let partialError: unknown;
    try {
      await options.mutationFn(variables);
    } catch (error) {
      partialError = error;
    }

    expect(partialError).toMatchObject({ error: 'bulk_partial_failure' });
    expect(bulkOffenderRefs(partialError)).toEqual(['output:out_mock_002']);
    options.onError(partialError, variables, context);
    expect(
      (
        queryClient.getQueryData(listKey) as { pages: { items: { asset_ref: string }[] }[] }
      ).pages[0].items.map((item) => item.asset_ref),
    ).toEqual(['output:out_mock_002']);
  });
});

describe('assetTagsMutationOptions()', () => {
  it('PATCHes the complete tag id set, optimistically updates detail cache, and rolls it back', async () => {
    let receivedBody: unknown;
    server.use(
      http.patch(`${BASE}/v1/library/assets/:asset_ref`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(
          makeLibraryAssetDetail({ tags: [{ id: 'tag-new', name: 'New' }] }),
        );
      }),
    );
    const queryClient = new QueryClient();
    const assetRef = 'output:abc';
    queryClient.setQueryData(libraryKeys.asset(assetRef), makeLibraryAssetDetail({ tags: [] }));
    const options = assetTagsMutationOptions(queryClient);
    const variables = { assetRef, tags: [{ id: 'tag-new', name: 'New' }] };

    const context = await options.onMutate(variables);
    expect(
      queryClient.getQueryData<{ tags: { id: string }[] }>(libraryKeys.asset(assetRef))?.tags,
    ).toEqual(variables.tags);

    await options.mutationFn(variables);
    expect(receivedBody).toEqual({ tag_ids: ['tag-new'] });

    options.onError(new Error('failed'), variables, context);
    expect(
      queryClient.getQueryData<{ tags: { id: string }[] }>(libraryKeys.asset(assetRef))?.tags,
    ).toEqual([]);
  });

  it('invalidates tags and library records when a tag is renamed', async () => {
    server.use(
      http.patch(`${BASE}/v1/library/tags/:tag_id`, () =>
        HttpResponse.json({
          id: 'tag-a',
          name: 'Renamed',
          created_at: '2025-06-01T12:00:00Z',
          updated_at: '2025-06-01T12:00:00Z',
        }),
      ),
    );
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const options = renameTagMutationOptions(queryClient);
    const variables = { tagId: 'tag-a', patch: { name: 'Renamed' } };

    const result = await options.mutationFn(variables);
    options.onSuccess(result, variables);

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(tagKeys.all);
    expect(keys).toContainEqual(libraryKeys.all);
  });
});

describe('projectsListQueryOptions()', () => {
  it('aggregates every cursor page into one project list', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      http.get(`${BASE}/v1/library/projects`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        if (cursor === 'page-2') {
          return HttpResponse.json({
            items: [
              {
                id: 'project-2',
                name: 'Second page',
                description: null,
                asset_count: 0,
                created_at: '2025-06-01T12:00:00Z',
                updated_at: '2025-06-01T12:00:00Z',
              },
            ],
            limit: 50,
            has_more: false,
            next_cursor: null,
          });
        }
        return HttpResponse.json({
          items: [
            {
              id: 'project-1',
              name: 'First page',
              description: null,
              asset_count: 0,
              created_at: '2025-06-01T12:00:00Z',
              updated_at: '2025-06-01T12:00:00Z',
            },
          ],
          limit: 50,
          has_more: true,
          next_cursor: 'page-2',
        });
      }),
    );

    const result = await projectsListQueryOptions().queryFn();

    expect(cursors).toEqual([null, 'page-2']);
    expect(result.items.map((project) => project.id)).toEqual(['project-1', 'project-2']);
    expect(result.has_more).toBe(false);
  });
});

describe('libraryAssetQueryOptions()', () => {
  it('fetches an asset detail by asset_ref, including colon-containing refs', async () => {
    server.use(
      http.get(`${BASE}/v1/library/assets/:asset_ref`, ({ params }) =>
        HttpResponse.json(makeLibraryAssetDetail({ asset_ref: params.asset_ref as string })),
      ),
    );

    const opts = libraryAssetQueryOptions('output:abc-123');
    const result = await opts.queryFn();
    expect(result.asset_ref).toBe('output:abc-123');
  });
});

describe('libraryGroupQueryOptions()', () => {
  it('fetches a group detail by job id', async () => {
    server.use(
      http.get(`${BASE}/v1/library/groups/:job_id`, ({ params }) =>
        HttpResponse.json({
          job_id: params.job_id,
          badge: 'prompt',
          input_media: null,
          prompt: 'test',
          negative_prompt: null,
          outputs: [],
          media_type: 'image',
          model: 'grok-imagine-image',
          provider: 'grok',
          generation_type: 't2i',
          aspect_ratio: '1:1',
          token_cost: 10,
          created_at: '2025-06-01T12:00:00Z',
          completed_at: null,
          lineage: null,
        }),
      ),
    );

    const opts = libraryGroupQueryOptions('job_999');
    const result = await opts.queryFn();
    expect(result.job_id).toBe('job_999');
  });
});

describe('favoriteMutationOptions() — optimistic update', () => {
  it('PUTs to add a favorite and DELETEs to remove one', async () => {
    let lastMethod: string | undefined;
    server.use(
      http.put(`${BASE}/v1/library/assets/:asset_ref/favorite`, () => {
        lastMethod = 'PUT';
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${BASE}/v1/library/assets/:asset_ref/favorite`, () => {
        lastMethod = 'DELETE';
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = new QueryClient();
    const opts = favoriteMutationOptions(queryClient);

    await opts.mutationFn({ assetRef: 'output:abc', favorite: true });
    expect(lastMethod).toBe('PUT');

    await opts.mutationFn({ assetRef: 'output:abc', favorite: false });
    expect(lastMethod).toBe('DELETE');
  });

  it('patches cached list pages optimistically and rolls back on error', async () => {
    const queryClient = new QueryClient();
    const listKey = libraryKeys.list();
    queryClient.setQueryData(listKey, {
      pages: [makeLibraryCursorPage(1, { asset_ref: 'output:abc', is_favorite: false })],
      pageParams: [null],
    });

    const opts = favoriteMutationOptions(queryClient);
    const context = await opts.onMutate({ assetRef: 'output:abc', favorite: true });

    const patched = queryClient.getQueryData<{
      pages: { items: { asset_ref: string; is_favorite: boolean }[] }[];
    }>(listKey);
    expect(patched?.pages[0].items[0].is_favorite).toBe(true);

    opts.onError(new Error('boom'), { assetRef: 'output:abc', favorite: true }, context);

    const restored = queryClient.getQueryData<{
      pages: { items: { asset_ref: string; is_favorite: boolean }[] }[];
    }>(listKey);
    expect(restored?.pages[0].items[0].is_favorite).toBe(false);
  });

  it('patches the asset detail cache and restores it on error', async () => {
    const queryClient = new QueryClient();
    const assetKey = libraryKeys.asset('output:abc');
    queryClient.setQueryData(assetKey, makeLibraryAssetDetail({ is_favorite: false }));

    const opts = favoriteMutationOptions(queryClient);
    const context = await opts.onMutate({ assetRef: 'output:abc', favorite: true });

    expect(queryClient.getQueryData<{ is_favorite: boolean }>(assetKey)?.is_favorite).toBe(true);

    opts.onError(new Error('boom'), { assetRef: 'output:abc', favorite: true }, context);

    expect(queryClient.getQueryData<{ is_favorite: boolean }>(assetKey)?.is_favorite).toBe(false);
  });
});

describe('renameMutationOptions()', () => {
  it('PATCHes display_title and invalidates the list and asset caches', async () => {
    server.use(
      http.patch(`${BASE}/v1/library/assets/:asset_ref`, async ({ params, request }) => {
        const body = (await request.json()) as { display_title?: string | null };
        return HttpResponse.json(
          makeLibraryAssetDetail({
            asset_ref: params.asset_ref as string,
            display_title: body.display_title ?? null,
          }),
        );
      }),
    );

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const opts = renameMutationOptions(queryClient);

    const result = await opts.mutationFn({ assetRef: 'output:abc', displayTitle: 'New name' });
    expect(result.display_title).toBe('New name');

    opts.onSuccess(result, { assetRef: 'output:abc' });
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(libraryKeys.all);
    expect(invalidatedKeys).toContainEqual(libraryKeys.asset('output:abc'));
  });
});

describe('deleteAssetMutationOptions()', () => {
  it('on success removes the item from cached pages and invalidates library, jobs, and user keys', async () => {
    server.use(
      http.delete(
        `${BASE}/v1/library/assets/:asset_ref`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const queryClient = new QueryClient();
    const listKey = libraryKeys.list();
    queryClient.setQueryData(listKey, {
      pages: [makeLibraryCursorPage(2, {}, false)],
      pageParams: [null],
    });
    const [firstItem] = (
      queryClient.getQueryData(listKey) as { pages: { items: { asset_ref: string }[] }[] }
    ).pages[0].items;

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const opts = deleteAssetMutationOptions(queryClient);

    await opts.mutationFn(firstItem.asset_ref);
    opts.onSuccess(undefined, firstItem.asset_ref);

    const patched = queryClient.getQueryData<{ pages: { items: { asset_ref: string }[] }[] }>(
      listKey,
    );
    expect(patched?.pages[0].items.some((i) => i.asset_ref === firstItem.asset_ref)).toBe(false);

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(libraryKeys.all);
    expect(invalidatedKeys).toContainEqual(storageKeys.all);
    expect(invalidatedKeys).toContainEqual(['jobs']);
    expect(invalidatedKeys).toContainEqual(['user']);
  });

  it('surfaces the backend error message when deletion fails', async () => {
    server.use(
      http.delete(`${BASE}/v1/library/assets/:asset_ref`, () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Library asset not found', status_code: 404 },
          { status: 404 },
        ),
      ),
    );

    const queryClient = new QueryClient();
    const opts = deleteAssetMutationOptions(queryClient);

    await expect(opts.mutationFn('output:missing')).rejects.toMatchObject({
      message: 'Library asset not found',
    });
  });
});
