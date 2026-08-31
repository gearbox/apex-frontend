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
    // A bundle can change capability semantics while retaining the same model_key.
    // Keep discovery live; session mutations explicitly invalidate this query too.
    staleTime: 0,
    refetchOnWindowFocus: true,
  };
}
