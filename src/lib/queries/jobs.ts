import apiClient from '$lib/api/client';
import type { QueryClient } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';
import { parseApiError, ApiRequestError } from '$lib/api/errors';

type JobStatus = components['schemas']['JobStatus'];
type GenerationType = components['schemas']['GenerationType'];
type Provider = components['schemas']['Provider'];

export interface JobListFilters {
  status?: JobStatus | null;
  provider?: Provider | null;
  generation_type?: GenerationType | GenerationType[] | null;
  limit?: number;
  cursor?: string | null;
}

export const jobKeys = {
  all: ['jobs'] as const,
  list: (filters: JobListFilters) => [...jobKeys.all, 'list', filters] as const,
  detail: (id: string) => [...jobKeys.all, 'detail', id] as const,
};

export function jobsListQueryOptions(filters: JobListFilters) {
  return {
    queryKey: jobKeys.list(filters),
    queryFn: async () => {
      const types = filters.generation_type;

      if (Array.isArray(types) && types.length > 1) {
        // Parallel calls for each type, then merge and sort by created_at desc.
        // Cursor-based paging is not supported when merging multiple types — non-paginating.
        const baseQuery = {
          status: filters.status,
          provider: filters.provider,
          limit: filters.limit,
        };
        const results = await Promise.all(
          types.map((t) =>
            apiClient.GET('/v1/jobs', { params: { query: { ...baseQuery, generation_type: t } } }),
          ),
        );
        for (const { error } of results) {
          if (error) throw new ApiRequestError(parseApiError(error, 0));
        }
        const items = results
          .flatMap((r) => r.data!.items)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return { items, limit: filters.limit ?? 20, has_more: false, next_cursor: null };
      }

      const singleType = Array.isArray(types) ? (types[0] ?? null) : types;
      const { data, error } = await apiClient.GET('/v1/jobs', {
        params: {
          query: {
            status: filters.status,
            provider: filters.provider,
            generation_type: singleType,
            limit: filters.limit,
            cursor: filters.cursor,
          },
        },
      });
      if (error || !data) throw new ApiRequestError(parseApiError(error, 0));
      return data;
    },
    staleTime: 0,
  };
}

export function jobDetailQueryOptions(id: string) {
  return {
    queryKey: jobKeys.detail(id),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/v1/jobs/{job_id}', {
        params: { path: { job_id: id } },
      });
      if (response.status === 404) return null;
      if (error || !data) throw new ApiRequestError(parseApiError(error, 0));
      return data; // UnifiedJobResponse
    },
    staleTime: 30 * 60 * 1000,
  };
}

export function deleteJobMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (jobId: string) => {
      const { error } = await apiClient.DELETE('/v1/jobs/{job_id}', {
        params: { path: { job_id: jobId } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, 0));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  };
}
