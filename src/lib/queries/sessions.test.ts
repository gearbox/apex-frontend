import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import {
  sessionKeys,
  sessionsListQueryOptions,
  sessionDetailQueryOptions,
  startSessionMutationOptions,
  stopSessionMutationOptions,
} from './sessions';
import type { GpuSessionResponse } from '$lib/api/sessions';

const mockSession: GpuSessionResponse = {
  id: 'sess_001',
  user_id: 'usr_001',
  product_id: 'prod_001',
  status: 'active',
  model_type: 'aisha-image',
  bundle_name: 'aisha-bundle',
  bundle_version: '1.0.0',
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
    const opts = sessionDetailQueryOptions('sess_001', { enabled: true, refetchInterval: 3000 });
    expect(opts.queryKey).toEqual(['sessions', 'detail', 'sess_001']);
    expect(opts.enabled).toBe(true);
    expect(opts.refetchInterval).toBe(3000);
    expect(opts.staleTime).toBe(0);
  });

  it('can be disabled', () => {
    const opts = sessionDetailQueryOptions('sess_001', { enabled: false, refetchInterval: false });
    expect(opts.enabled).toBe(false);
    expect(opts.refetchInterval).toBe(false);
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
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['providers'] });
  });
});

describe('stopSessionMutationOptions()', () => {
  it('onSuccess invalidates sessions + providers', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const opts = stopSessionMutationOptions(queryClient);
    await opts.onSuccess();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['providers'] });
  });
});
