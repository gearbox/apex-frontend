import apiClient from '$lib/api/client';
import { parseApiError, ApiRequestError } from '$lib/api/errors';
import {
  LIBRARY_PAGE_SIZE,
  LIBRARY_LIST_STALE_MS,
  LIBRARY_ASSET_STALE_MS,
} from '$lib/utils/constants';
import { storageKeys } from '$lib/queries/storage';
import type { QueryClient, InfiniteData } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';

type LibraryAssetItem = components['schemas']['LibraryAssetItem'];
type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];
type LibraryAssetSource = components['schemas']['LibraryAssetSource'];
type LibraryAssetPatch = components['schemas']['LibraryAssetPatch'];
type OutputMediaType = components['schemas']['OutputMediaType'];
type LibrarySort = components['schemas']['LibrarySort'];
type LibraryProject = components['schemas']['LibraryProject'];
type LibraryProjectCreate = components['schemas']['LibraryProjectCreate'];
type LibraryProjectPatch = components['schemas']['LibraryProjectPatch'];
type LibraryProjectListItem = components['schemas']['LibraryProjectListItem'];
type LibraryTag = components['schemas']['LibraryTag'];
type LibraryTagCreate = components['schemas']['LibraryTagCreate'];
type LibraryTagPatch = components['schemas']['LibraryTagPatch'];
type LibraryTagListItem = components['schemas']['LibraryTagListItem'];
type LibraryTagRef = components['schemas']['LibraryTagRef'];
type LibraryLineageGraph = components['schemas']['LibraryLineageGraph'];
type BulkOperationResult = components['schemas']['BulkOperationResult'];
type LibraryPage = {
  items: LibraryAssetItem[];
  limit: number;
  has_more: boolean;
  next_cursor?: string | null;
};
type ProjectPage = {
  items: LibraryProjectListItem[];
  limit: number;
  has_more: boolean;
  next_cursor?: string | null;
};
type TagPage = {
  items: LibraryTagListItem[];
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
  lineage: (assetRef: string) => ['library', 'lineage', assetRef] as const,
};

export const projectKeys = {
  all: ['library', 'projects'] as const,
  list: () => ['library', 'projects', 'list'] as const,
  detail: (projectId: string) => ['library', 'projects', 'detail', projectId] as const,
};

export const tagKeys = {
  all: ['library', 'tags'] as const,
  list: () => ['library', 'tags', 'list'] as const,
  detail: (tagId: string) => ['library', 'tags', 'detail', tagId] as const,
};

/* ─── Types ─── */

export interface LibraryListParams {
  source?: LibraryAssetSource | null;
  media_type?: OutputMediaType | null;
  model?: string | null;
  favorite?: boolean | null;
  project_id?: string | null;
  tag_id?: string | null;
  /** Server-side text search. */
  query?: string | null;
  expiring?: boolean | null;
  sort?: LibrarySort | null;
}

/* ─── Query Options ─── */

export function libraryListInfiniteQueryOptions(params: LibraryListParams = {}) {
  return {
    queryKey: libraryKeys.list(params),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const apiQuery = {
        limit: LIBRARY_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(params.source ? { source: params.source } : {}),
        ...(params.media_type ? { media_type: params.media_type } : {}),
        ...(params.model ? { model: params.model } : {}),
        ...(params.favorite ? { favorite: params.favorite } : {}),
        ...(params.project_id ? { project_id: params.project_id } : {}),
        ...(params.tag_id ? { tag_id: params.tag_id } : {}),
        ...(params.query ? { query: params.query } : {}),
        ...(params.expiring ? { expiring: params.expiring } : {}),
        ...(params.sort ? { sort: params.sort } : {}),
      };
      const { data, error } = await apiClient.GET('/v1/library', {
        params: {
          query: apiQuery,
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

export function projectsListQueryOptions() {
  return {
    queryKey: projectKeys.list(),
    queryFn: async () => {
      const fetchPage = async (cursor?: string): Promise<ProjectPage> => {
        const { data, error } = await apiClient.GET('/v1/library/projects', {
          params: {
            query: {
              limit: 50,
              ...(cursor ? { cursor } : {}),
            },
          },
        });
        if (error) throw new ApiRequestError(parseApiError(error, 0));
        return (
          (data as ProjectPage | undefined) ?? {
            items: [] as LibraryProjectListItem[],
            limit: 50,
            has_more: false,
            next_cursor: null,
          }
        );
      };

      let page = await fetchPage();
      const items = [...page.items];
      const cursors = new Set<string>();

      while (page.has_more) {
        const cursor = page.next_cursor;
        if (!cursor || cursors.has(cursor)) {
          throw new ApiRequestError({
            error: 'invalid_pagination',
            message: 'Could not load all projects due to an invalid pagination cursor.',
            status_code: 0,
          });
        }
        cursors.add(cursor);
        page = await fetchPage(cursor);
        items.push(...page.items);
      }

      return { ...page, items, has_more: false, next_cursor: null };
    },
    staleTime: LIBRARY_LIST_STALE_MS,
  };
}

/** Load the complete tag vocabulary for the editor and picker, rejecting malformed cursor chains. */
export function tagsListQueryOptions() {
  return {
    queryKey: tagKeys.list(),
    queryFn: async () => {
      const fetchPage = async (cursor?: string): Promise<TagPage> => {
        const { data, error } = await apiClient.GET('/v1/library/tags', {
          params: {
            query: {
              limit: 50,
              ...(cursor ? { cursor } : {}),
            },
          },
        });
        if (error) throw new ApiRequestError(parseApiError(error, 0));
        return (
          (data as TagPage | undefined) ?? {
            items: [] as LibraryTagListItem[],
            limit: 50,
            has_more: false,
            next_cursor: null,
          }
        );
      };

      let page = await fetchPage();
      const items = [...page.items];
      const cursors = new Set<string>();

      while (page.has_more) {
        const cursor = page.next_cursor;
        if (!cursor || cursors.has(cursor)) {
          throw new ApiRequestError({
            error: 'invalid_pagination',
            message: 'Could not load all tags due to an invalid pagination cursor.',
            status_code: 0,
          });
        }
        cursors.add(cursor);
        page = await fetchPage(cursor);
        items.push(...page.items);
      }

      return { ...page, items, has_more: false, next_cursor: null };
    },
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

/** Mounted only when the details-sheet lineage section is expanded. */
export function lineageQueryOptions(assetRef: string) {
  return {
    queryKey: libraryKeys.lineage(assetRef),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/v1/library/assets/{asset_ref}/lineage', {
        params: { path: { asset_ref: assetRef } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
      return data as LibraryLineageGraph;
    },
    staleTime: 5 * 60 * 1_000,
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
      const previousDetail = queryClient.getQueryData<LibraryAssetDetail>(
        libraryKeys.asset(variables.assetRef),
      );
      queryClient.setQueryData<LibraryAssetDetail>(libraryKeys.asset(variables.assetRef), (d) =>
        d ? { ...d, is_favorite: variables.favorite } : d,
      );
      return { previous, previousDetail };
    },
    onError: (
      _err: unknown,
      variables: { assetRef: string; favorite: boolean },
      context?: { previous: ListSnapshot; previousDetail?: LibraryAssetDetail },
    ) => {
      if (context?.previous) restoreLists(queryClient, context.previous);
      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(libraryKeys.asset(variables.assetRef), context.previousDetail);
      }
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

export function projectAssignmentMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: { assetRef: string; projectId: string | null }) => {
      const patch: LibraryAssetPatch = { project_id: variables.projectId };
      const { data, error } = await apiClient.PATCH('/v1/library/assets/{asset_ref}', {
        params: { path: { asset_ref: variables.assetRef } },
        body: patch,
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
      return data as LibraryAssetDetail;
    },
    onSuccess: (_data: LibraryAssetDetail, variables: { assetRef: string }) => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: libraryKeys.asset(variables.assetRef) });
    },
  };
}

/**
 * Tag PATCH is deliberately separate from title/project patches: its caller always supplies
 * the complete desired tag set, so optimistic cache updates can be rolled back as one unit.
 */
export function assetTagsMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: { assetRef: string; tags: LibraryTagRef[] }) => {
      const patch: LibraryAssetPatch = { tag_ids: variables.tags.map((tag) => tag.id) };
      const { data, error } = await apiClient.PATCH('/v1/library/assets/{asset_ref}', {
        params: { path: { asset_ref: variables.assetRef } },
        body: patch,
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
      return data as LibraryAssetDetail;
    },
    onMutate: async (variables: { assetRef: string; tags: LibraryTagRef[] }) => {
      await queryClient.cancelQueries({ queryKey: libraryKeys.asset(variables.assetRef) });
      const previous = patchAssetInLists(queryClient, variables.assetRef, { tags: variables.tags });
      const previousDetail = queryClient.getQueryData<LibraryAssetDetail>(
        libraryKeys.asset(variables.assetRef),
      );
      queryClient.setQueryData<LibraryAssetDetail>(libraryKeys.asset(variables.assetRef), (data) =>
        data ? { ...data, tags: variables.tags } : data,
      );
      return { previous, previousDetail };
    },
    onError: (
      _error: unknown,
      variables: { assetRef: string; tags: LibraryTagRef[] },
      context?: { previous: ListSnapshot; previousDetail?: LibraryAssetDetail },
    ) => {
      if (context?.previous) restoreLists(queryClient, context.previous);
      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(libraryKeys.asset(variables.assetRef), context.previousDetail);
      }
    },
    onSettled: (
      _data: LibraryAssetDetail | undefined,
      _error: unknown,
      variables: { assetRef: string },
    ) => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: libraryKeys.asset(variables.assetRef) });
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  };
}

function invalidateProjectAndLibraryQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: libraryKeys.all });
  queryClient.invalidateQueries({ queryKey: projectKeys.all });
}

function invalidateTagAndLibraryQueries(queryClient: QueryClient) {
  // Tags also live on cached detail/list records, so a rename or deletion must refresh both.
  queryClient.invalidateQueries({ queryKey: tagKeys.all });
  queryClient.invalidateQueries({ queryKey: libraryKeys.all });
}

export function createTagMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (tag: LibraryTagCreate) => {
      const { data, error } = await apiClient.POST('/v1/library/tags', { body: tag });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
      return data as LibraryTag;
    },
    onSuccess: () => invalidateTagAndLibraryQueries(queryClient),
  };
}

export function renameTagMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: { tagId: string; patch: LibraryTagPatch }) => {
      const { data, error } = await apiClient.PATCH('/v1/library/tags/{tag_id}', {
        params: { path: { tag_id: variables.tagId } },
        body: variables.patch,
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
      return data as LibraryTag;
    },
    onSuccess: (_data: LibraryTag, variables: { tagId: string }) => {
      invalidateTagAndLibraryQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(variables.tagId) });
    },
  };
}

export function deleteTagMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (tagId: string) => {
      const { error } = await apiClient.DELETE('/v1/library/tags/{tag_id}', {
        params: { path: { tag_id: tagId } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
    },
    onSuccess: () => invalidateTagAndLibraryQueries(queryClient),
  };
}

export function createProjectMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (project: LibraryProjectCreate) => {
      const { data, error } = await apiClient.POST('/v1/library/projects', { body: project });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
      return data as LibraryProject;
    },
    onSuccess: () => invalidateProjectAndLibraryQueries(queryClient),
  };
}

export function renameProjectMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: { projectId: string; patch: LibraryProjectPatch }) => {
      const { data, error } = await apiClient.PATCH('/v1/library/projects/{project_id}', {
        params: { path: { project_id: variables.projectId } },
        body: variables.patch,
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
      return data as LibraryProject;
    },
    onSuccess: (_data: LibraryProject, variables: { projectId: string }) => {
      invalidateProjectAndLibraryQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.projectId) });
    },
  };
}

export function deleteProjectMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (projectId: string) => {
      const { error } = await apiClient.DELETE('/v1/library/projects/{project_id}', {
        params: { path: { project_id: projectId } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
    },
    onSuccess: () => invalidateProjectAndLibraryQueries(queryClient),
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
      queryClient.invalidateQueries({ queryKey: storageKeys.all });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  };
}

export type BulkMutationVariables =
  | { type: 'set_favorite'; assetRefs: string[]; value: boolean }
  | { type: 'set_project'; assetRefs: string[]; projectId: string | null }
  | { type: 'add_tags'; assetRefs: string[]; tagIds: string[] }
  | { type: 'remove_tags'; assetRefs: string[]; tagIds: string[] }
  | { type: 'delete'; assetRefs: string[] };

function toBulkRequest(
  variables: BulkMutationVariables,
):
  | components['schemas']['BulkSetFavorite']
  | components['schemas']['BulkSetProject']
  | components['schemas']['BulkAddTags']
  | components['schemas']['BulkRemoveTags']
  | components['schemas']['BulkDelete'] {
  if (variables.type === 'set_favorite') {
    return { type: variables.type, asset_refs: variables.assetRefs, value: variables.value };
  }
  if (variables.type === 'set_project') {
    return {
      type: variables.type,
      asset_refs: variables.assetRefs,
      project_id: variables.projectId,
    };
  }
  if (variables.type === 'add_tags' || variables.type === 'remove_tags') {
    return {
      type: variables.type,
      asset_refs: variables.assetRefs,
      tag_ids: variables.tagIds,
    };
  }
  return { type: variables.type, asset_refs: variables.assetRefs };
}

/**
 * Parse offending asset refs from the backend's validation envelope. The API has used
 * both `extra.asset_refs` and `detail.offenders`; accepting either keeps the UI useful
 * across backend deployments without treating a 400 as a successful bulk operation.
 */
export function bulkOffenderRefs(error: unknown): string[] {
  const source = error instanceof ApiRequestError ? [error.extra, error.detail] : [];
  const refs = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const object = value as Record<string, unknown>;
    for (const key of ['asset_refs', 'offenders', 'offending_refs', 'failed_refs']) {
      const candidate = object[key];
      if (Array.isArray(candidate)) {
        for (const item of candidate) if (typeof item === 'string') refs.add(item);
      }
    }
  };
  for (const value of source) collect(value);
  return [...refs];
}

export function bulkMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: BulkMutationVariables) => {
      const { data, error, response } = await apiClient.POST('/v1/library/assets/bulk', {
        body: toBulkRequest(variables),
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      const result = data as BulkOperationResult;
      if (result.failed > 0) {
        throw new ApiRequestError({
          error: 'bulk_partial_failure',
          message: `${result.failed} asset${result.failed === 1 ? '' : 's'} could not be updated.`,
          status_code: response.status,
          extra: {
            failed_refs: result.results
              .filter((item) => !item.success)
              .map((item) => item.asset_ref),
          },
        });
      }
      return result;
    },
    onMutate: async (variables: BulkMutationVariables) => {
      if (variables.type !== 'delete') return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: libraryKeys.all });
      const previous = queryClient.getQueriesData<InfiniteData<LibraryPage>>({
        queryKey: ['library', 'list'],
      }) as ListSnapshot;
      const deletedRefs = new Set(variables.assetRefs);
      queryClient.setQueriesData<InfiniteData<LibraryPage>>(
        { queryKey: ['library', 'list'] },
        (data) => {
          if (!data) return data;
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => !deletedRefs.has(item.asset_ref)),
            })),
          };
        },
      );
      return { previous };
    },
    onError: (
      error: unknown,
      variables: BulkMutationVariables,
      context?: { previous?: ListSnapshot },
    ) => {
      if (variables.type === 'delete' && context?.previous) {
        restoreLists(queryClient, context.previous);
        // Preserve successfully deleted assets while putting only the backend-reported failures
        // back into the optimistic cache. If the response omitted refs, restore everything
        // conservatively until the invalidation below refetches the source of truth.
        if (error instanceof ApiRequestError && error.error === 'bulk_partial_failure') {
          const failedRefs = new Set(bulkOffenderRefs(error));
          if (failedRefs.size > 0) {
            for (const assetRef of variables.assetRefs) {
              if (!failedRefs.has(assetRef)) removeAssetFromLists(queryClient, assetRef);
            }
          }
        }
      }
    },
    onSettled: () => {
      invalidateProjectAndLibraryQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
      queryClient.invalidateQueries({ queryKey: storageKeys.all });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  };
}
