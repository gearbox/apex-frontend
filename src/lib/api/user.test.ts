import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { fetchUserStats, changePassword, logoutAllDevices, deleteAccount } from './user';
import { ApiRequestError } from './errors';

const BASE = 'http://localhost:8000';

describe('fetchUserStats()', () => {
  it('returns typed stats on success', async () => {
    server.use(
      http.get(`${BASE}/v1/users/me/stats`, () =>
        HttpResponse.json({
          total_jobs: 10,
          completed_jobs: 8,
          failed_jobs: 2,
          total_outputs: 20,
          total_uploads: 5,
          storage_used_bytes: 1024,
        }),
      ),
    );
    const stats = await fetchUserStats();
    expect(stats.total_jobs).toBe(10);
    expect(stats.completed_jobs).toBe(8);
    expect(stats.failed_jobs).toBe(2);
    expect(stats.total_outputs).toBe(20);
    expect(stats.total_uploads).toBe(5);
    expect(stats.storage_used_bytes).toBe(1024);
  });

  it('throws ApiRequestError on server error', async () => {
    server.use(
      http.get(`${BASE}/v1/users/me/stats`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Internal server error', status_code: 500 },
          { status: 500 },
        ),
      ),
    );
    await expect(fetchUserStats()).rejects.toThrow(ApiRequestError);
  });
});

describe('changePassword()', () => {
  it('returns message on success', async () => {
    server.use(
      http.post(`${BASE}/v1/users/me/password`, () =>
        new HttpResponse(JSON.stringify({ message: 'Password changed successfully' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const result = await changePassword({ current_password: 'old-pass', new_password: 'new-pass-123' });
    expect(result.message).toBe('Password changed successfully');
  });

  it('throws ApiRequestError when current password is wrong', async () => {
    server.use(
      http.post(`${BASE}/v1/users/me/password`, () =>
        HttpResponse.json(
          { error: 'invalid_password', message: 'Current password is incorrect', status_code: 400 },
          { status: 400 },
        ),
      ),
    );
    await expect(
      changePassword({ current_password: 'wrong-password', new_password: 'new-pass-123' }),
    ).rejects.toThrow(ApiRequestError);
  });

  it('throws ApiRequestError with correct message on failure', async () => {
    server.use(
      http.post(`${BASE}/v1/users/me/password`, () =>
        HttpResponse.json(
          { error: 'invalid_password', message: 'Current password is incorrect', status_code: 400 },
          { status: 400 },
        ),
      ),
    );
    let caught: unknown;
    try {
      await changePassword({ current_password: 'wrong', new_password: 'new-pass-123' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).message).toBe('Current password is incorrect');
  });
});

describe('logoutAllDevices()', () => {
  it('returns message on success', async () => {
    server.use(
      http.post(`${BASE}/v1/users/me/logout-all`, () =>
        new HttpResponse(JSON.stringify({ message: 'All sessions revoked' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const result = await logoutAllDevices();
    expect(result.message).toBe('All sessions revoked');
  });

  it('throws ApiRequestError on server error', async () => {
    server.use(
      http.post(`${BASE}/v1/users/me/logout-all`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Internal server error', status_code: 500 },
          { status: 500 },
        ),
      ),
    );
    await expect(logoutAllDevices()).rejects.toThrow(ApiRequestError);
  });
});

describe('deleteAccount()', () => {
  it('returns DeleteAccountResponse with deactivated_at', async () => {
    const deactivatedAt = '2026-03-30T12:00:00Z';
    server.use(
      http.delete(`${BASE}/v1/users/me`, () =>
        HttpResponse.json({
          message: 'Account deactivated',
          deactivated_at: deactivatedAt,
        }),
      ),
    );
    const result = await deleteAccount();
    expect(result.message).toBe('Account deactivated');
    expect(result.deactivated_at).toBe(deactivatedAt);
  });

  it('throws ApiRequestError on server error', async () => {
    server.use(
      http.delete(`${BASE}/v1/users/me`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Internal server error', status_code: 500 },
          { status: 500 },
        ),
      ),
    );
    await expect(deleteAccount()).rejects.toThrow(ApiRequestError);
  });
});
