import type { QueryClient, QueryFunctionContext } from '@tanstack/svelte-query';
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

/**
 * `id: null` represents "no runtime session to look up" — e.g. the selected model currently has
 * no session association. It must never be encoded as `''`: the reconnect scanner in
 * EventStreamService discovers cached session IDs by reading this query's key component, and an
 * empty string would look like a real (if bogus) session ID and trigger `GET /v1/sessions/`.
 * A `null` key component can never be mistaken for a server-issued ID.
 */
export function sessionDetailQueryOptions(
  queryClient: QueryClient,
  id: string | null,
  opts: { enabled: boolean },
) {
  const queryKey = [...sessionKeys.all, 'detail', id] as const;
  return {
    queryKey,
    queryFn: async ({ signal }: QueryFunctionContext<typeof queryKey>) => {
      if (id === null) throw new Error('sessionDetailQueryOptions: no session id to fetch');
      return ingestSessionSnapshot(queryClient, await getSession(id, signal));
    },
    enabled: opts.enabled && id !== null,
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
