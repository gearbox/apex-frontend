import { beforeEach, describe, expect, it } from 'vitest';
import {
  getPendingPayments,
  hasPaymentsAwaitingReconciliation,
  reconcilePendingPayments,
  savePendingPayment,
  type PendingPaymentScope,
} from './pendingPayments';

const scope: PendingPaymentScope = { userId: 'user-a', product: 'product-a' };

beforeEach(() => localStorage.clear());

describe('pending payments', () => {
  it('is versioned and scoped to the signed-in user and product', () => {
    savePendingPayment(scope, {
      paymentId: 'pay-1',
      provider: 'stripe',
      amountUsd: 25,
      createdAt: new Date().toISOString(),
      state: 'created',
    });

    expect(getPendingPayments(scope)).toHaveLength(1);
    expect(getPendingPayments({ userId: 'user-b', product: 'product-a' })).toEqual([]);
    expect(getPendingPayments({ userId: 'user-a', product: 'product-b' })).toEqual([]);
  });

  it('ignores corrupt persisted state', () => {
    localStorage.setItem('apex:pending-payments:v1:product-a:user-a', '{invalid json');
    expect(getPendingPayments(scope)).toEqual([]);
  });

  it('matches settlements only by transaction payment_id and supports later partial credits', () => {
    savePendingPayment(scope, {
      paymentId: 'pay-1',
      provider: 'nowpayments',
      amountUsd: 25,
      payCurrency: 'USDTTRC20',
      createdAt: new Date().toISOString(),
      state: 'returned',
    });
    reconcilePendingPayments(scope, [
      {
        id: 'transaction-1',
        transaction_type: 'topup',
        amount: 100,
        balance_after: 300,
        description: null,
        metadata: {},
        job_id: null,
        payment_id: 'other-payment',
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
      },
    ]);
    expect(getPendingPayments(scope)[0].state).toBe('returned');

    reconcilePendingPayments(scope, [
      {
        id: 'transaction-2',
        transaction_type: 'topup',
        amount: 100,
        balance_after: 400,
        description: null,
        metadata: {},
        job_id: null,
        payment_id: 'pay-1',
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
      },
    ]);
    expect(getPendingPayments(scope)[0]).toMatchObject({
      state: 'credited',
      lastCreditedBalance: 400,
    });
    expect(hasPaymentsAwaitingReconciliation(scope)).toBe(true);
  });
});
