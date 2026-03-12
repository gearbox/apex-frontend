import apiClient from '$lib/api/client';
import type { QueryClient } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';

type JobStatus = components['schemas']['JobStatus'];
type GenerationType = components['schemas']['GenerationType'];

export interface JobListFilters {
  status?: JobStatus | null;
  provider?: string | null;
  generation_type?: GenerationType | null;
  limit?: number;
  offset?: number;
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
      const { data, error } = await apiClient.GET('/v1/jobs', {
        params: { query: filters },
      });
      if (error || !data) throw new Error('Failed to fetch jobs');
      return data; // UnifiedJobListResponse
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
      if (error || !data) throw new Error('Failed to fetch job');
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
      if (error) throw new Error('Failed to delete job');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  };
}
