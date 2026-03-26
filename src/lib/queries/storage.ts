import apiClient from '$lib/api/client';
import { PRESIGNED_URL_STALE_MS } from '$lib/utils/constants';

/* ─── Query Key Factory ─── */

export const storageKeys = {
  all: ['storage'] as const,
  uploads: (params?: object) => ['storage', 'uploads', params ?? {}] as const,
};

/* ─── Query Options ─── */

const UPLOADS_PAGE_SIZE = 30;

export function uploadsInfiniteQueryOptions() {
  return {
    queryKey: storageKeys.uploads(),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const { data, error } = await apiClient.GET('/v1/storage/uploads', {
        params: {
          query: {
            limit: UPLOADS_PAGE_SIZE,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
      });
      if (error) throw error;
      return data ?? { items: [], limit: UPLOADS_PAGE_SIZE, has_more: false, next_cursor: null };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: { has_more: boolean; next_cursor?: string | null }) =>
      lastPage.has_more ? lastPage.next_cursor : undefined,
    staleTime: PRESIGNED_URL_STALE_MS, // 30 min — upload list metadata doesn't change often
  };
}
