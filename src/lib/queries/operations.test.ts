import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';

const { getOperationMock } = vi.hoisted(() => ({ getOperationMock: vi.fn() }));

vi.mock('$lib/api/sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/sessions')>()),
  getOperation: getOperationMock,
}));

import {
  ingestSessionSnapshot,
  operationKeys,
  operationQueryOptions,
  upsertOperation,
} from './operations';

type OperationResponse = components['schemas']['OperationResponse'];
type GpuSessionResponse = components['schemas']['GpuSessionResponse'];

function operation(
  revision: number,
  overrides: Partial<OperationResponse> = {},
): OperationResponse {
  return {
    id: 'op_001',
    session_id: 'sess_001',
    deployment_id: 'deploy_001',
    kind: 'bundle_provision',
    status: 'queued',
    phase: null,
    revision,
    target: null,
    progress: null,
    message: null,
    error: null,
    started_at: null,
    updated_at: '2026-09-09T00:00:00Z',
    finished_at: null,
    ...overrides,
  };
}

function session(overrides: Partial<GpuSessionResponse> = {}): GpuSessionResponse {
  return {
    id: 'sess_001',
    user_id: 'user_001',
    product_id: 'product_001',
    status: 'provisioning',
    tunnel_hostname: null,
    vastai_gpu_name: null,
    vastai_cost_per_hour_micros: null,
    created_at: '2026-09-09T00:00:00Z',
    in_flight_job_count: 0,
    ...overrides,
  };
}

describe('canonical operation cache', () => {
  it('inserts a legitimate revision 0 operation', () => {
    const client = new QueryClient();
    upsertOperation(client, operation(0));
    expect(client.getQueryData(operationKeys.detail('op_001'))).toMatchObject({ revision: 0 });
  });

  it('replaces revision 0 with revision 1', () => {
    const client = new QueryClient();
    upsertOperation(client, operation(0));
    upsertOperation(client, operation(1, { status: 'running' }));
    expect(client.getQueryData<OperationResponse>(operationKeys.detail('op_001'))?.revision).toBe(
      1,
    );
  });

  it('ignores equal and older revisions', () => {
    const client = new QueryClient();
    upsertOperation(client, operation(3, { message: 'newest' }));
    upsertOperation(client, operation(3, { message: 'equal' }));
    upsertOperation(client, operation(2, { message: 'older' }));
    expect(client.getQueryData<OperationResponse>(operationKeys.detail('op_001'))?.message).toBe(
      'newest',
    );
  });

  it('retains unknown and cohort operations without deployment routing', () => {
    const client = new QueryClient();
    upsertOperation(
      client,
      operation(2, { id: 'op_cohort', deployment_id: null, kind: 'comfyui_restart' }),
    );
    expect(client.getQueryData(operationKeys.detail('op_cohort'))).toMatchObject({ revision: 2 });
  });

  it('hydrates bootstrap and every deployment operation without regressing SSE state', () => {
    const client = new QueryClient();
    upsertOperation(client, operation(4));
    ingestSessionSnapshot(
      client,
      session({
        bootstrap_operation: operation(2),
        deployments: [
          {
            id: 'deploy_001',
            model_type: 'aisha-image',
            bundle_name: 'aisha',
            bundle_version: null,
            status: 'deploying',
            pending_restart: false,
            routing_suspended: false,
            is_primary: true,
            created_at: '2026-09-09T00:00:00Z',
            activated_at: null,
            current_operation: operation(1, { id: 'op_deployment' }),
          },
          {
            id: 'deploy_002',
            model_type: 'aisha-image-lite',
            bundle_name: 'lite',
            bundle_version: null,
            status: 'deploying',
            pending_restart: false,
            routing_suspended: false,
            is_primary: false,
            created_at: '2026-09-09T00:00:00Z',
            activated_at: null,
            current_operation: operation(0, { id: 'op_second' }),
          },
        ],
      }),
    );

    expect(client.getQueryData<OperationResponse>(operationKeys.detail('op_001'))?.revision).toBe(
      4,
    );
    expect(
      client.getQueryData<OperationResponse>(operationKeys.detail('op_deployment'))?.revision,
    ).toBe(1);
    expect(
      client.getQueryData<OperationResponse>(operationKeys.detail('op_second'))?.revision,
    ).toBe(0);
  });

  it('retains revision watermarks beyond the ordinary inactive-query GC window', () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient({
        defaultOptions: { queries: { gcTime: 5 * 60_000 } },
      });

      upsertOperation(client, operation(5));
      vi.advanceTimersByTime(5 * 60_000 + 1);
      expect(client.getQueryData<OperationResponse>(operationKeys.detail('op_001'))?.revision).toBe(
        5,
      );

      upsertOperation(client, operation(4));
      expect(client.getQueryData<OperationResponse>(operationKeys.detail('op_001'))?.revision).toBe(
        5,
      );

      upsertOperation(client, operation(6));
      expect(client.getQueryData<OperationResponse>(operationKeys.detail('op_001'))?.revision).toBe(
        6,
      );

      client.clear();
      expect(client.getQueryData(operationKeys.detail('op_001'))).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('operationQueryOptions()', () => {
  it('returns the retained newer SSE revision when fallback REST is older', async () => {
    const client = new QueryClient();
    upsertOperation(client, operation(6));
    getOperationMock.mockResolvedValueOnce(operation(4));
    const options = operationQueryOptions(client, 'sess_001', 'op_001', {
      fallback: true,
      enabled: true,
    });

    await expect(options.queryFn({ signal: new AbortController().signal })).resolves.toMatchObject({
      revision: 6,
    });
    expect(client.getQueryData<OperationResponse>(operationKeys.detail('op_001'))).toMatchObject({
      revision: 6,
    });
  });

  it('accepts newer and revision-zero REST operations through the canonical cache', async () => {
    const client = new QueryClient();
    upsertOperation(client, operation(4));
    getOperationMock.mockResolvedValueOnce(operation(5));
    const newer = operationQueryOptions(client, 'sess_001', 'op_001', {
      fallback: true,
      enabled: true,
    });
    await expect(newer.queryFn({ signal: new AbortController().signal })).resolves.toMatchObject({
      revision: 5,
    });

    const freshClient = new QueryClient();
    getOperationMock.mockResolvedValueOnce(operation(0));
    const queued = operationQueryOptions(freshClient, 'sess_001', 'op_001', {
      fallback: true,
      enabled: true,
    });
    await expect(queued.queryFn({ signal: new AbortController().signal })).resolves.toMatchObject({
      revision: 0,
      status: 'queued',
    });
  });

  it('only schedules fallback polling for non-terminal operations', () => {
    const client = new QueryClient();
    const options = operationQueryOptions(client, 'sess_001', 'op_001', {
      fallback: false,
      enabled: true,
    });
    expect(options.enabled).toBe(false);
    expect(options.refetchInterval()).toBe(false);

    const fallback = operationQueryOptions(client, 'sess_001', 'op_001', {
      fallback: true,
      enabled: true,
    });
    expect(fallback.refetchInterval()).toBe(3000);
    upsertOperation(client, operation(1, { status: 'succeeded' }));
    expect(fallback.refetchInterval()).toBe(false);
  });
});
