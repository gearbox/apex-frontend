import type { QueryClient } from '@tanstack/svelte-query';
import {
  listSessions,
  getSession,
  startSession,
  previewStop,
  stopSession,
  type GpuSessionResponse,
} from '$lib/api/sessions';
import type { components } from '$lib/api/types';
import { providerKeys } from '$lib/queries/providers';
import { ingestSessionSnapshot } from '$lib/queries/operations';

type ModelType = components['schemas']['ModelType'];

export const sessionKeys = {
  all: ['sessions'] as const,
  list: (includeTerminal: boolean) => [...sessionKeys.all, 'list', includeTerminal] as const,
  detail: (id: string) => [...sessionKeys.all, 'detail', id] as const,
};

/**
 * @param refetchInterval pass a number derived from $isSSEFallback at the call site:
 *        SSE connected → false (no poll); fallback → e.g. 8000ms.
 */
export function sessionsListQueryOptions(
  includeTerminal = false,
  refetchInterval: number | false = false,
) {
  return {
    queryKey: sessionKeys.list(includeTerminal),
    queryFn: () => listSessions(includeTerminal),
    staleTime: 10_000,
    refetchInterval,
    refetchOnWindowFocus: true,
  };
}

export function sessionDetailQueryOptions(
  queryClient: QueryClient,
  id: string,
  opts: { enabled: boolean },
) {
  return {
    queryKey: sessionKeys.detail(id),
    queryFn: async () => ingestSessionSnapshot(queryClient, await getSession(id)),
    enabled: opts.enabled,
    staleTime: 0,
  };
}

export function startSessionMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (model: ModelType) => startSession(model),
    onSuccess: (session: GpuSessionResponse) => {
      queryClient.setQueryData(
        sessionKeys.detail(session.id),
        ingestSessionSnapshot(queryClient, session),
      );
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: providerKeys.catalog() });
    },
  };
}

export function stopSessionMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (id: string) => stopSession(id),
    onSuccess: (session: GpuSessionResponse) => {
      queryClient.setQueryData(
        sessionKeys.detail(session.id),
        ingestSessionSnapshot(queryClient, session),
      );
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: providerKeys.catalog() });
    },
  };
}

export { previewStop };
