import type { QueryClient, QueryFunctionContext } from '@tanstack/svelte-query';
import {
  listSessions,
  getSession,
  pauseSession,
  resumeSession,
  attachDeployment,
  removeDeployment,
  startSession,
  previewStop,
  stopSession,
  type GpuSessionResponse,
} from '$lib/api/sessions';
import type { components } from '$lib/api/types';
import { providerKeys } from '$lib/queries/providers';
import { ingestSessionSnapshot, upsertOperation } from '$lib/queries/operations';

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
  opts: { enabled: boolean; refetchInterval?: number | false },
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
    refetchInterval: opts.refetchInterval ?? false,
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
      queryClient.invalidateQueries({ queryKey: sessionKeys.list(false), exact: true });
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
      queryClient.invalidateQueries({ queryKey: sessionKeys.list(false), exact: true });
      queryClient.invalidateQueries({ queryKey: providerKeys.catalog() });
    },
  };
}

function writeSessionMutationSnapshot(queryClient: QueryClient, session: GpuSessionResponse): void {
  queryClient.setQueryData(
    sessionKeys.detail(session.id),
    ingestSessionSnapshot(queryClient, session),
  );
  queryClient.invalidateQueries({ queryKey: sessionKeys.list(false), exact: true });
  queryClient.invalidateQueries({ queryKey: providerKeys.catalog() });
}

export function pauseSessionMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (sessionId: string) => pauseSession(sessionId),
    onSuccess: (session: GpuSessionResponse) => writeSessionMutationSnapshot(queryClient, session),
  };
}

export function resumeSessionMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (sessionId: string) => resumeSession(sessionId),
    onSuccess: (session: GpuSessionResponse) => writeSessionMutationSnapshot(queryClient, session),
  };
}

export interface DeploymentMutationVariables {
  sessionId: string;
  deploymentId: string;
  force?: boolean;
}

function reconcileDeploymentMutation(queryClient: QueryClient, sessionId: string) {
  return {
    onSuccess: (result: Awaited<ReturnType<typeof attachDeployment>>) => {
      upsertOperation(queryClient, result.operation);
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId), exact: true });
      queryClient.invalidateQueries({ queryKey: sessionKeys.list(false), exact: true });
      queryClient.invalidateQueries({ queryKey: providerKeys.catalog() });
    },
  };
}

export function attachDeploymentMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ sessionId, model }: { sessionId: string; model: ModelType }) =>
      attachDeployment(sessionId, model),
    onSuccess: (
      result: Awaited<ReturnType<typeof attachDeployment>>,
      variables: { sessionId: string },
    ) => reconcileDeploymentMutation(queryClient, variables.sessionId).onSuccess(result),
  };
}

export function removeDeploymentMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ sessionId, deploymentId, force = false }: DeploymentMutationVariables) =>
      removeDeployment(sessionId, deploymentId, force),
    onSuccess: (
      result: Awaited<ReturnType<typeof removeDeployment>>,
      variables: DeploymentMutationVariables,
    ) => reconcileDeploymentMutation(queryClient, variables.sessionId).onSuccess(result),
  };
}

export { previewStop };
