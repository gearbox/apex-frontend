import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';

type ProvidersResponse = components['schemas']['ProvidersResponse'];

export function providersQueryOptions() {
  return {
    queryKey: ['providers'] as const,
    queryFn: async (): Promise<ProvidersResponse> => {
      const { data } = await apiClient.GET('/v1/providers');
      return data ?? { providers: [], user_context: null };
    },
    staleTime: 60 * 60 * 1000,
  };
}
