import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  getPendingPayments,
  hasPaymentsAwaitingReconciliation,
  markPendingPaymentCancelled,
  markPendingPaymentReturned,
  getPendingPaymentPollingInterval,
  pendingPaymentsRevision,
  reconcilePendingPayments,
  savePendingPayment,
  startPendingPaymentsStorageListener,
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

  it('selects the newest matching top-up regardless of transaction ordering', () => {
    const save = () =>
      savePendingPayment(scope, {
        paymentId: 'pay-latest',
        provider: 'nowpayments',
        amountUsd: 25,
        createdAt: new Date().toISOString(),
        state: 'created',
      });
    const oldCredit = {
      id: 'tx-old',
      transaction_type: 'topup' as const,
      amount: 50,
      balance_after: 150,
      description: null,
      metadata: {},
      job_id: null,
      payment_id: 'pay-latest',
      created_at: '2026-01-01T00:00:00Z',
      created_by: null,
    };
    const latestCredit = {
      ...oldCredit,
      id: 'tx-latest',
      balance_after: 200,
      created_at: '2026-01-02T00:00:00Z',
    };

    save();
    reconcilePendingPayments(scope, [latestCredit, oldCredit]);
    expect(getPendingPayments(scope)[0]).toMatchObject({
      lastCreditedBalance: 200,
      lastCreditedTransactionId: 'tx-latest',
    });

    save();
    reconcilePendingPayments(scope, [oldCredit, latestCredit]);
    expect(getPendingPayments(scope)[0]).toMatchObject({
      lastCreditedBalance: 200,
      lastCreditedTransactionId: 'tx-latest',
    });
  });

  it('does not bump the revision for an unchanged reconciliation pass', () => {
    savePendingPayment(scope, {
      paymentId: 'pay-unchanged',
      provider: 'stripe',
      amountUsd: 25,
      createdAt: new Date().toISOString(),
      state: 'created',
    });
    const revision = get(pendingPaymentsRevision);

    reconcilePendingPayments(scope, []);

    expect(get(pendingPaymentsRevision)).toBe(revision);
  });

  it('stops polling a cancelled record but permits an exact later credit', () => {
    savePendingPayment(scope, {
      paymentId: 'pay-cancelled',
      provider: 'stripe',
      amountUsd: 25,
      createdAt: new Date().toISOString(),
      state: 'created',
    });
    markPendingPaymentCancelled(scope, 'pay-cancelled');
    expect(hasPaymentsAwaitingReconciliation(scope)).toBe(false);

    reconcilePendingPayments(scope, [
      {
        id: 'tx-cancelled',
        transaction_type: 'topup',
        amount: 2500,
        balance_after: 2500,
        description: null,
        metadata: {},
        job_id: null,
        payment_id: 'pay-cancelled',
        created_at: '2026-01-03T00:00:00Z',
        created_by: null,
      },
    ]);
    expect(getPendingPayments(scope)[0].state).toBe('credited');
  });

  it('reports whether an exact return-state record changed', () => {
    savePendingPayment(scope, {
      paymentId: 'pay-returned',
      provider: 'stripe',
      amountUsd: 25,
      createdAt: new Date().toISOString(),
      state: 'created',
    });
    expect(markPendingPaymentReturned(scope, 'missing')).toBe(false);
    expect(markPendingPaymentReturned(scope, 'pay-returned')).toBe(true);
    expect(markPendingPaymentReturned(scope, 'pay-returned')).toBe(false);
  });

  it('uses a slower fallback cadence after a record is credited', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T00:00:00Z'));
    savePendingPayment(scope, {
      paymentId: 'pay-cadence',
      provider: 'stripe',
      amountUsd: 25,
      createdAt: new Date().toISOString(),
      state: 'created',
    });
    expect(getPendingPaymentPollingInterval(scope)).toBe(30_000);
    reconcilePendingPayments(scope, [
      {
        id: 'tx-cadence',
        transaction_type: 'topup',
        amount: 2500,
        balance_after: 2500,
        description: null,
        metadata: {},
        job_id: null,
        payment_id: 'pay-cadence',
        created_at: new Date().toISOString(),
        created_by: null,
      },
    ]);
    expect(getPendingPaymentPollingInterval(scope)).toBe(5 * 60_000);
    vi.useRealTimers();
  });

  it('bumps the revision for a relevant external-tab storage event only', () => {
    const stop = startPendingPaymentsStorageListener();
    const revision = get(pendingPaymentsRevision);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'unrelated-key',
        storageArea: localStorage,
      }),
    );
    expect(get(pendingPaymentsRevision)).toBe(revision);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'apex:pending-payments:v1:product-a:user-a',
        storageArea: localStorage,
      }),
    );
    expect(get(pendingPaymentsRevision)).toBe(revision + 1);
    stop();
  });
});
