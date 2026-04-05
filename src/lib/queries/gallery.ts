import apiClient from '$lib/api/client';
import { parseApiError, ApiRequestError } from '$lib/api/errors';
import { GALLERY_PAGE_SIZE } from '$lib/utils/constants';
import type { QueryClient } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';
import { storageKeys } from '$lib/queries/storage';

type GalleryGridItem = components['schemas']['GalleryGridItem'];
type GalleryGroupDetail = components['schemas']['GalleryGroupDetail'];
type OutputMediaType = components['schemas']['OutputMediaType'];
type GenerationType = components['schemas']['GenerationType'];

/* ─── Query Key Factory ─── */

export const galleryKeys = {
  all: ['gallery'] as const,
  list: (params?: GalleryListParams) => ['gallery', 'list', params ?? {}] as const,
  detail: (jobId: string) => ['gallery', 'detail', jobId] as const,
};

/* ─── Types ─── */

export interface GalleryListParams {
  media_type?: OutputMediaType | null;
  generation_type?: GenerationType | null;
  model?: string | null;
}

/* ─── Query Options ─── */

export function galleryListInfiniteQueryOptions(params: GalleryListParams = {}) {
  return {
    queryKey: galleryKeys.list(params),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const { data, error } = await apiClient.GET('/v1/gallery', {
        params: {
          query: {
            limit: GALLERY_PAGE_SIZE,
            ...(pageParam ? { cursor: pageParam } : {}),
            ...(params.media_type ? { media_type: params.media_type } : {}),
            ...(params.generation_type ? { generation_type: params.generation_type } : {}),
            ...(params.model ? { model: params.model } : {}),
          },
        },
      });
      if (error) throw error;
      return (
        data ?? {
          items: [] as GalleryGridItem[],
          limit: GALLERY_PAGE_SIZE,
          has_more: false,
          next_cursor: null,
        }
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: { has_more: boolean; next_cursor?: string | null }) =>
      lastPage.has_more ? lastPage.next_cursor : undefined,
    staleTime: 5 * 60 * 1000,
  };
}

/**
 * Mutation for deleting any user content (output or upload) via the unified
 * DELETE /v1/content/{content_id} endpoint.
 *
 * Pass the output ID or upload ID as the mutation variable.
 * The backend checks generation_outputs first, then user_images.
 */
export function deleteContentMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (contentId: string) => {
      const { error } = await apiClient.DELETE('/v1/content/{content_id}', {
        params: { path: { content_id: contentId } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.all });
      queryClient.invalidateQueries({ queryKey: storageKeys.all });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  };
}

export function galleryDetailQueryOptions(jobId: string) {
  return {
    queryKey: galleryKeys.detail(jobId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/v1/gallery/{job_id}', {
        params: { path: { job_id: jobId } },
      });
      if (error) throw error;
      return data as GalleryGroupDetail;
    },
    staleTime: 10 * 60 * 1000,
  };
}
