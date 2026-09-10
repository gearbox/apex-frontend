import type { QueryClient } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';
import type { GpuSessionResponse } from '$lib/api/sessions';

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
  configureOperationCache(queryClient);
  const key = operationKeys.detail(incoming.id);
  const cached = queryClient.getQueryData<OperationResponse>(key);

  if (!cached || incoming.revision > cached.revision) {
    queryClient.setQueryData(key, incoming);
    return incoming;
  }

  return cached;
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
