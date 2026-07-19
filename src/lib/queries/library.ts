import apiClient from '$lib/api/client';
import { parseApiError, ApiRequestError } from '$lib/api/errors';
import {
  LIBRARY_PAGE_SIZE,
  LIBRARY_LIST_STALE_MS,
  LIBRARY_ASSET_STALE_MS,
} from '$lib/utils/constants';
import type { QueryClient, InfiniteData } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';

type LibraryAssetItem = components['schemas']['LibraryAssetItem'];
type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];
type LibraryAssetSource = components['schemas']['LibraryAssetSource'];
type LibraryAssetPatch = components['schemas']['LibraryAssetPatch'];
type OutputMediaType = components['schemas']['OutputMediaType'];
type LibraryPage = {
  items: LibraryAssetItem[];
  limit: number;
  has_more: boolean;
  next_cursor?: string | null;
};

/* ─── Query Key Factory ─── */

export const libraryKeys = {
  all: ['library'] as const,
  list: (params?: LibraryListParams) => ['library', 'list', params ?? {}] as const,
  asset: (assetRef: string) => ['library', 'asset', assetRef] as const,
  group: (jobId: string) => ['library', 'group', jobId] as const,
};

/* ─── Types ─── */

export interface LibraryListParams {
  source?: LibraryAssetSource | null;
  media_type?: OutputMediaType | null;
  model?: string | null;
  favorite?: boolean | null;
}

/* ─── Query Options ─── */

export function libraryListInfiniteQueryOptions(params: LibraryListParams = {}) {
  return {
    queryKey: libraryKeys.list(params),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const { data, error } = await apiClient.GET('/v1/library', {
        params: {
          query: {
            limit: LIBRARY_PAGE_SIZE,
            ...(pageParam ? { cursor: pageParam } : {}),
            ...(params.source ? { source: params.source } : {}),
            ...(params.media_type ? { media_type: params.media_type } : {}),
            ...(params.model ? { model: params.model } : {}),
            ...(params.favorite ? { favorite: params.favorite } : {}),
          },
        },
      });
      if (error) throw error;
      return (
        (data as LibraryPage | undefined) ?? {
          items: [] as LibraryAssetItem[],
          limit: LIBRARY_PAGE_SIZE,
          has_more: false,
          next_cursor: null,
        }
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: LibraryPage) =>
      lastPage.has_more ? lastPage.next_cursor : undefined,
    staleTime: LIBRARY_LIST_STALE_MS,
  };
}

export function libraryAssetQueryOptions(assetRef: string) {
  return {
    queryKey: libraryKeys.asset(assetRef),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/v1/library/assets/{asset_ref}', {
        params: { path: { asset_ref: assetRef } },
      });
      if (error) throw error;
      return data as LibraryAssetDetail;
    },
    staleTime: LIBRARY_ASSET_STALE_MS,
  };
}

export function libraryGroupQueryOptions(jobId: string) {
  return {
    queryKey: libraryKeys.group(jobId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/v1/library/groups/{job_id}', {
        params: { path: { job_id: jobId } },
      });
      if (error) throw error;
      return data as LibraryGroupDetail;
    },
    staleTime: LIBRARY_ASSET_STALE_MS,
  };
}

/* ─── Mutations ─── */

/** Snapshot of every cached library list page, for optimistic-update rollback. */
type ListSnapshot = [readonly unknown[], InfiniteData<LibraryPage> | undefined][];

function patchAssetInLists(
  queryClient: QueryClient,
  assetRef: string,
  patch: Partial<LibraryAssetItem>,
): ListSnapshot {
  // Scoped to list queries only — libraryKeys.all also matches the single-asset
  // and group detail caches, which aren't InfiniteData and have no `.pages`.
  const previous = queryClient.getQueriesData<InfiniteData<LibraryPage>>({
    queryKey: ['library', 'list'],
  }) as ListSnapshot;

  queryClient.setQueriesData<InfiniteData<LibraryPage>>(
    { queryKey: ['library', 'list'] },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.asset_ref === assetRef ? { ...item, ...patch } : item,
          ),
        })),
      };
    },
  );

  return previous;
}

function restoreLists(queryClient: QueryClient, previous: ListSnapshot) {
  for (const [queryKey, data] of previous) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function favoriteMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: { assetRef: string; favorite: boolean }) => {
      const { assetRef, favorite } = variables;
      const { error } = favorite
        ? await apiClient.PUT('/v1/library/assets/{asset_ref}/favorite', {
            params: { path: { asset_ref: assetRef } },
          })
        : await apiClient.DELETE('/v1/library/assets/{asset_ref}/favorite', {
            params: { path: { asset_ref: assetRef } },
          });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
    },
    onMutate: async (variables: { assetRef: string; favorite: boolean }) => {
      await queryClient.cancelQueries({ queryKey: libraryKeys.all });
      const previous = patchAssetInLists(queryClient, variables.assetRef, {
        is_favorite: variables.favorite,
      });
      return { previous };
    },
    onError: (_err: unknown, _variables: unknown, context?: { previous: ListSnapshot }) => {
      if (context?.previous) restoreLists(queryClient, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  };
}

export function renameMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: { assetRef: string; displayTitle: string | null }) => {
      const patch: LibraryAssetPatch = { display_title: variables.displayTitle };
      const { data, error } = await apiClient.PATCH('/v1/library/assets/{asset_ref}', {
        params: { path: { asset_ref: variables.assetRef } },
        body: patch,
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
      return data as LibraryAssetDetail;
    },
    onSuccess: (_data: LibraryAssetDetail, variables: { assetRef: string }) => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: libraryKeys.asset(variables.assetRef) });
    },
  };
}

function removeAssetFromLists(queryClient: QueryClient, assetRef: string) {
  // Scoped to list queries only — see patchAssetInLists for why libraryKeys.all is unsafe here.
  queryClient.setQueriesData<InfiniteData<LibraryPage>>(
    { queryKey: ['library', 'list'] },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => item.asset_ref !== assetRef),
        })),
      };
    },
  );
}

export function deleteAssetMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (assetRef: string) => {
      const { error } = await apiClient.DELETE('/v1/library/assets/{asset_ref}', {
        params: { path: { asset_ref: assetRef } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
    },
    onSuccess: (_data: void, assetRef: string) => {
      // Remove immediately so the grid doesn't flash the deleted item before
      // the invalidated query refetches.
      removeAssetFromLists(queryClient, assetRef);
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  };
}
