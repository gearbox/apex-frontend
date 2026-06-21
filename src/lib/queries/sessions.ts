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
 * Single-session poll used ONLY while provisioning, to surface provisioning_progress.
 * The page enables this (and sets the interval) only when a session is in a provisioning
 * status, and disables it on active/terminal.
 */
export function sessionDetailQueryOptions(
  id: string,
  opts: { enabled: boolean; refetchInterval: number | false },
) {
  return {
    queryKey: sessionKeys.detail(id),
    queryFn: () => getSession(id),
    enabled: opts.enabled,
    refetchInterval: opts.refetchInterval,
    staleTime: 0,
  };
}

export function startSessionMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (model: ModelType) => startSession(model),
    onSuccess: (session: GpuSessionResponse) => {
      queryClient.setQueryData(sessionKeys.detail(session.id), session);
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  };
}

export function stopSessionMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (id: string) => stopSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  };
}

export { previewStop };
