import { describe, it, expect } from 'vitest';
import { adminKeys } from './admin';

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
});
