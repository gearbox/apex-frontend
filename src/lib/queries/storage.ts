import apiClient from '$lib/api/client';

/* ─── Query Key Factory ─── */

export const storageKeys = {
  all: ['storage'] as const,
  stats: () => ['storage', 'stats'] as const,
};

/* ─── Query Options ─── */

export function storageStatsQueryOptions() {
  return {
    queryKey: storageKeys.stats(),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/v1/storage/stats');
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
  };
}
