import apiClient from '$lib/api/client';
import { throwApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';
import type { QueryFunctionContext } from '@tanstack/svelte-query';

export type ProvidersResponse = components['schemas']['ProvidersResponse'];

export const providerKeys = {
  all: ['providers'] as const,
  catalog: () => providerKeys.all,
};

export async function fetchProviders(signal?: AbortSignal): Promise<ProvidersResponse> {
  const { data, error, response } = await apiClient.GET('/v1/providers', { signal });
  const status = response.status;
  const headers = response.headers;
  if (error || !data) {
    throwApiError(error, 'Failed to load providers', status, headers);
  }
  return data;
}

export function providersQueryOptions(refetchInterval: number | false = false) {
  return {
    queryKey: providerKeys.catalog(),
    queryFn: ({ signal }: QueryFunctionContext<ReturnType<typeof providerKeys.catalog>>) =>
      fetchProviders(signal),
    // A bundle can change capability semantics while retaining the same model_key.
    // Keep discovery live; session mutations explicitly invalidate this query too.
    staleTime: 0,
    refetchInterval,
    refetchOnWindowFocus: true,
  };
}
