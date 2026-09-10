import type { QueryClient } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';
import { getOperation, type GpuSessionResponse } from '$lib/api/sessions';

export type OperationResponse = components['schemas']['OperationResponse'];

/** Canonical, revision-ordered cache for durable GPU operations. */
export const operationKeys = {
  all: ['operations'] as const,
  detail: (id: string) => [...operationKeys.all, 'detail', id] as const,
};

/**
 * Operations are an in-memory, revision-ordered lifecycle ledger. They are normally unobserved,
 * so retain their watermarks for the authenticated tab lifetime instead of the default 5 minutes.
 * resetQueryCache()/QueryClient.clear() still clears this namespace on logout or account change.
 */
export function configureOperationCache(queryClient: QueryClient): void {
  queryClient.setQueryDefaults(operationKeys.all, { gcTime: Infinity });
}

/**
 * Stores an operation only when it advances its server-assigned revision.
 * Timestamps and lifecycle labels intentionally play no part in ordering.
 */
export function upsertOperation(
  queryClient: QueryClient,
  incoming: OperationResponse,
): OperationResponse {
  const key = operationKeys.detail(incoming.id);
  const cached = queryClient.getQueryData<OperationResponse>(key);

  if (!cached || incoming.revision > cached.revision) {
    queryClient.setQueryData(key, incoming);
    return incoming;
  }

  return cached;
}

export function isTerminalOperation(operation: OperationResponse | undefined): boolean {
  return operation?.status === 'succeeded' || operation?.status === 'failed';
}

/**
 * Uses the canonical operation key while retaining the session ID solely for the fallback API
 * route. A REST response may be older than an SSE update, so the query returns the effective
 * cache value from `upsertOperation`, never the raw response.
 */
export function operationQueryOptions(
  queryClient: QueryClient,
  sessionId: string,
  operationId: string,
  opts: { fallback: boolean; enabled: boolean },
) {
  const queryKey = operationKeys.detail(operationId);
  const enabled = opts.enabled && Boolean(sessionId) && Boolean(operationId) && opts.fallback;
  return {
    queryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      upsertOperation(queryClient, await getOperation(sessionId, operationId, signal)),
    enabled,
    staleTime: 0,
    // Operations are hydrated by SSE when it is healthy. The query becomes a bounded recovery
    // poll only while the event stream is in fallback mode, and immediately stops at terminal.
    refetchInterval: (): number | false =>
      opts.fallback && !isTerminalOperation(queryClient.getQueryData<OperationResponse>(queryKey))
        ? 3000
        : false,
  };
}

/**
 * Keeps session/deployment scalars as REST snapshots while routing every embedded
 * full operation through the one canonical, monotonic operation cache.
 */
export function ingestSessionSnapshot(
  queryClient: QueryClient,
  session: GpuSessionResponse,
): GpuSessionResponse {
  if (session.bootstrap_operation) {
    upsertOperation(queryClient, session.bootstrap_operation);
  }

  for (const deployment of session.deployments ?? []) {
    if (deployment.current_operation) {
      upsertOperation(queryClient, deployment.current_operation);
    }
  }

  return session;
}
