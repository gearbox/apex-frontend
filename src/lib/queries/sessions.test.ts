import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../mocks/config';
import {
  sessionKeys,
  sessionsListQueryOptions,
  sessionDetailQueryOptions,
  startSessionMutationOptions,
  attachDeploymentMutationOptions,
  removeDeploymentMutationOptions,
  stopPreviewMutationOptions,
  confirmedStopMutationOptions,
} from './sessions';
import type { GpuSessionResponse } from '$lib/api/sessions';
import { operationKeys } from './operations';

const mockSession: GpuSessionResponse = {
  id: 'sess_001',
  user_id: 'usr_001',
  product_id: 'prod_001',
  status: 'active',
  tunnel_hostname: null,
  vastai_gpu_name: 'RTX 4090',
  vastai_cost_per_hour_micros: 50000,
  created_at: '2026-06-20T00:00:00Z',
  in_flight_job_count: 0,
};

describe('sessionKeys', () => {
  it('all key is ["sessions"]', () => {
    expect(sessionKeys.all).toEqual(['sessions']);
  });

  it('list key includes list and includeTerminal flag', () => {
    expect(sessionKeys.list(false)).toEqual(['sessions', 'list', false]);
    expect(sessionKeys.list(true)).toEqual(['sessions', 'list', true]);
  });

  it('detail key includes detail and id', () => {
    expect(sessionKeys.detail('sess_001')).toEqual(['sessions', 'detail', 'sess_001']);
  });
});

describe('sessionsListQueryOptions()', () => {
  it('returns correct queryKey for default params', () => {
    const opts = sessionsListQueryOptions();
    expect(opts.queryKey).toEqual(['sessions', 'list', false]);
  });

  it('returns correct queryKey for includeTerminal=true', () => {
    const opts = sessionsListQueryOptions(true);
    expect(opts.queryKey).toEqual(['sessions', 'list', true]);
  });

  it('uses provided refetchInterval', () => {
    const opts = sessionsListQueryOptions(false, 8000);
    expect(opts.refetchInterval).toBe(8000);
  });

  it('defaults refetchInterval to false', () => {
    const opts = sessionsListQueryOptions();
    expect(opts.refetchInterval).toBe(false);
  });
});

describe('sessionDetailQueryOptions()', () => {
  it('returns correct queryKey and respects enabled flag', () => {
    const opts = sessionDetailQueryOptions(new QueryClient(), 'sess_001', { enabled: true });
    expect(opts.queryKey).toEqual(['sessions', 'detail', 'sess_001']);
    expect(opts.enabled).toBe(true);
    expect(opts.staleTime).toBe(0);
    expect(opts.refetchInterval).toBe(false);
  });

  it('can be disabled', () => {
    const opts = sessionDetailQueryOptions(new QueryClient(), 'sess_001', { enabled: false });
    expect(opts.enabled).toBe(false);
  });

  it('represents "no session" with a null key component, never an empty string', () => {
    const opts = sessionDetailQueryOptions(new QueryClient(), null, { enabled: true });
    expect(opts.queryKey).toEqual(['sessions', 'detail', null]);
    expect(opts.queryKey).not.toContain('');
    expect(opts.enabled).toBe(false);
  });

  it('rejects if queryFn is ever invoked directly with a null id', async () => {
    const opts = sessionDetailQueryOptions(new QueryClient(), null, { enabled: true });
    await expect(opts.queryFn({ signal: new AbortController().signal } as never)).rejects.toThrow();
  });
});

describe('startSessionMutationOptions()', () => {
  it('onSuccess sets detail cache and invalidates sessions + providers', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setDataSpy = vi.spyOn(queryClient, 'setQueryData');

    const opts = startSessionMutationOptions(queryClient);
    await opts.onSuccess(mockSession);

    expect(setDataSpy).toHaveBeenCalledWith(sessionKeys.detail('sess_001'), mockSession);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: sessionKeys.list(false),
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['providers'] });
  });
});

describe('stopPreviewMutationOptions()', () => {
  it('calls the preview (confirmed:false) stop endpoint without touching the cache', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          session_id: 'sess_001',
          model_type: 'aisha-image',
          vastai_gpu_name: null,
          vastai_cost_per_hour_micros: null,
          active_duration_seconds: 60,
          paused_duration_seconds: 0,
          estimated_final_tokens: 10,
          message: 'preview',
        });
      }),
    );
    const opts = stopPreviewMutationOptions();
    const result = await opts.mutationFn('sess_001');
    expect(capturedBody).toEqual({ confirmed: false });
    expect(result.estimated_final_tokens).toBe(10);
  });
});

describe('confirmedStopMutationOptions()', () => {
  it('onSuccess writes the detail cache and invalidates sessions + providers', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setDataSpy = vi.spyOn(queryClient, 'setQueryData');

    const opts = confirmedStopMutationOptions(queryClient);
    await opts.onSuccess(mockSession);

    expect(setDataSpy).toHaveBeenCalledWith(sessionKeys.detail('sess_001'), mockSession);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: sessionKeys.list(false),
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['providers'] });
  });

  it('sends confirmed:true to the stop endpoint', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...mockSession, status: 'stopping' });
      }),
    );
    const opts = confirmedStopMutationOptions(new QueryClient());
    const result = await opts.mutationFn('sess_001');
    expect(capturedBody).toEqual({ confirmed: true });
    expect(result.status).toBe('stopping');
  });
});

describe('deployment mutation options', () => {
  const response = {
    deployment: { id: 'dep_001', model_type: 'aisha-image-lite', status: 'deploying' },
    operation: {
      id: 'op_001',
      session_id: 'sess_001',
      deployment_id: 'dep_001',
      kind: 'bundle_provision',
      status: 'queued',
      phase: null,
      revision: 0,
      target: null,
      progress: null,
      message: null,
      error: null,
      started_at: null,
      updated_at: '2026-09-10T00:00:00Z',
      finished_at: null,
    },
  } as never;

  it('upserts attach operations before requesting REST reconciliation', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const options = attachDeploymentMutationOptions(queryClient);
    await options.onSuccess(response, { sessionId: 'sess_001' });

    expect(queryClient.getQueryData(operationKeys.detail('op_001'))).toMatchObject({ revision: 0 });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: sessionKeys.detail('sess_001'),
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionKeys.list(false), exact: true });
  });

  it('uses the same revision-safe reconciliation for remove', async () => {
    const queryClient = new QueryClient();
    const options = removeDeploymentMutationOptions(queryClient);
    await options.onSuccess(response, {
      sessionId: 'sess_001',
      deploymentId: 'dep_001',
      force: true,
    });
    expect(queryClient.getQueryData(operationKeys.detail('op_001'))).toMatchObject({ revision: 0 });
  });
});
