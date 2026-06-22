import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { adminKeys, sendBroadcastMutationOptions } from './admin';

describe('adminKeys', () => {
  it('all returns base key', () => {
    expect(adminKeys.all).toEqual(['admin']);
  });

  it('users returns key with params', () => {
    expect(adminKeys.users()).toEqual(['admin', 'users', {}]);
    expect(adminKeys.users({ role: 'admin' })).toEqual(['admin', 'users', { role: 'admin' }]);
  });

  it('orgs returns key with params', () => {
    expect(adminKeys.orgs()).toEqual(['admin', 'orgs', {}]);
    expect(adminKeys.orgs({ limit: 10 })).toEqual(['admin', 'orgs', { limit: 10 }]);
  });

  it('models returns key with params', () => {
    expect(adminKeys.models()).toEqual(['admin', 'models', {}]);
    expect(adminKeys.models({ enabled_only: true })).toEqual([
      'admin',
      'models',
      { enabled_only: true },
    ]);
  });

  it('payments returns key with params', () => {
    expect(adminKeys.payments()).toEqual(['admin', 'payments', {}]);
    expect(adminKeys.payments({ status: 'completed' })).toEqual([
      'admin',
      'payments',
      { status: 'completed' },
    ]);
  });

  it('accountBalance returns key with account id', () => {
    expect(adminKeys.accountBalance('acc_001')).toEqual(['admin', 'account-balance', 'acc_001']);
  });

  it('accountTransactions returns key with id and params', () => {
    expect(adminKeys.accountTransactions('acc_001')).toEqual([
      'admin',
      'account-txns',
      'acc_001',
      {},
    ]);
    expect(adminKeys.accountTransactions('acc_001', { limit: 5 })).toEqual([
      'admin',
      'account-txns',
      'acc_001',
      { limit: 5 },
    ]);
  });

  it('pricing returns key with params', () => {
    expect(adminKeys.pricing()).toEqual(['admin', 'pricing', {}]);
    expect(adminKeys.pricing({ active_only: true })).toEqual([
      'admin',
      'pricing',
      { active_only: true },
    ]);
  });

  it('generates admins key', () => {
    expect(adminKeys.admins()).toEqual(['admin', 'manage', 'admins']);
  });

  it('generates audit key', () => {
    expect(adminKeys.audit()).toEqual(['admin', 'manage', 'audit', {}]);
  });

  it('generates audit key with target_user_id', () => {
    expect(adminKeys.audit({ target_user_id: 'usr_001' })).toEqual([
      'admin',
      'manage',
      'audit',
      { target_user_id: 'usr_001' },
    ]);
  });
});

describe('sendBroadcastMutationOptions()', () => {
  it('onSuccess invalidates adminKeys.audit()', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const opts = sendBroadcastMutationOptions(queryClient);
    await opts.onSuccess();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: adminKeys.audit() });
  });

  it('mutationFn calls sendBroadcast with an idempotency key', async () => {
    const { http, HttpResponse } = await import('msw');
    const { server } = await import('../../mocks/server');

    let capturedKey: string | null = null;
    server.use(
      http.post('http://localhost:8000/v1/admin/broadcast', async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key');
        return HttpResponse.json({ message: 'ok' });
      }),
    );

    const queryClient = new QueryClient();
    const opts = sendBroadcastMutationOptions(queryClient);
    await opts.mutationFn({ level: 'info', title: 'T', message: 'M' });

    expect(capturedKey).toBeTruthy();
    expect(typeof capturedKey).toBe('string');
  });
});
