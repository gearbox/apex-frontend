import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';

export type ProvidersResponse = components['schemas']['ProvidersResponse'];

export const providerKeys = {
  all: ['providers'] as const,
  catalog: () => providerKeys.all,
};

export async function fetchProviders(): Promise<ProvidersResponse> {
  const { data } = await apiClient.GET('/v1/providers');
  return data ?? { providers: [], user_context: null };
}

export function providersQueryOptions() {
  return {
    queryKey: providerKeys.catalog(),
    queryFn: fetchProviders,
    // A bundle can change capability semantics while retaining the same model_key.
    // Keep discovery live; session mutations explicitly invalidate this query too.
    staleTime: 0,
    refetchOnWindowFocus: true,
  };
}
