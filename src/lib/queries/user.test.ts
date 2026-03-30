import { describe, it, expect, vi } from 'vitest';
import {
  userKeys,
  userStatsQueryOptions,
  changePasswordMutationOptions,
  logoutAllMutationOptions,
  deleteAccountMutationOptions,
} from './user';
import * as userApi from '$lib/api/user';

describe('userKeys', () => {
  it('all key is ["user"]', () => {
    expect(userKeys.all).toEqual(['user']);
  });

  it('stats key includes "stats"', () => {
    expect(userKeys.stats()).toEqual(['user', 'stats']);
  });
});

describe('userStatsQueryOptions()', () => {
  it('returns correct queryKey', () => {
    const opts = userStatsQueryOptions();
    expect(opts.queryKey).toEqual(['user', 'stats']);
  });

  it('sets staleTime to 5 minutes', () => {
    const opts = userStatsQueryOptions();
    expect(opts.staleTime).toBe(5 * 60 * 1000);
  });

  it('queryFn calls fetchUserStats', async () => {
    const mockStats = {
      total_jobs: 10,
      completed_jobs: 8,
      failed_jobs: 2,
      total_outputs: 20,
      total_uploads: 5,
      storage_used_bytes: 1024,
    };
    const spy = vi.spyOn(userApi, 'fetchUserStats').mockResolvedValue(mockStats);
    const opts = userStatsQueryOptions();
    const result = await opts.queryFn();
    expect(spy).toHaveBeenCalledOnce();
    expect(result).toEqual(mockStats);
    spy.mockRestore();
  });
});

describe('changePasswordMutationOptions()', () => {
  it('mutationFn calls changePassword with body', async () => {
    const mockResponse = { message: 'Password changed successfully' };
    const spy = vi.spyOn(userApi, 'changePassword').mockResolvedValue(mockResponse);
    const opts = changePasswordMutationOptions();
    const result = await opts.mutationFn({ current_password: 'old', new_password: 'new12345' });
    expect(spy).toHaveBeenCalledWith({ current_password: 'old', new_password: 'new12345' });
    expect(result).toEqual(mockResponse);
    spy.mockRestore();
  });
});

describe('logoutAllMutationOptions()', () => {
  it('mutationFn calls logoutAllDevices', async () => {
    const mockResponse = { message: 'All sessions revoked' };
    const spy = vi.spyOn(userApi, 'logoutAllDevices').mockResolvedValue(mockResponse);
    const opts = logoutAllMutationOptions();
    const result = await opts.mutationFn();
    expect(spy).toHaveBeenCalledOnce();
    expect(result).toEqual(mockResponse);
    spy.mockRestore();
  });
});

describe('deleteAccountMutationOptions()', () => {
  it('mutationFn calls deleteAccount', async () => {
    const mockResponse = { message: 'Account deactivated', deactivated_at: '2026-03-30T00:00:00Z' };
    const spy = vi.spyOn(userApi, 'deleteAccount').mockResolvedValue(mockResponse);
    const opts = deleteAccountMutationOptions();
    const result = await opts.mutationFn();
    expect(spy).toHaveBeenCalledOnce();
    expect(result).toEqual(mockResponse);
    spy.mockRestore();
  });
});
