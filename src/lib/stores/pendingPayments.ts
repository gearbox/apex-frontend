import { writable } from 'svelte/store';
import { isBrowser } from '$lib/utils/env';
import type { TransactionResponse } from '$lib/api/billing';
import { getPaymentStorageScope, type PaymentStorageScope } from './paymentScope';

const STORAGE_VERSION = 1;
export const PENDING_PAYMENT_STORAGE_PREFIX = 'apex:pending-payments';
const RECONCILIATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PendingPaymentScope = PaymentStorageScope;

export interface PendingPayment {
  paymentId: string;
  provider: string;
  amountUsd: number;
  payCurrency?: string;
  createdAt: string;
  state: 'created' | 'returned' | 'cancelled' | 'credited';
  lastCreditedBalance?: number;
  lastCreditedAt?: string;
  lastCreditedTransactionId?: string;
}

/** Bumped after local changes so pages can enable temporary reconciliation polling. */
export const pendingPaymentsRevision = writable(0);

function storageKey(scope: PendingPaymentScope): string {
  return `${PENDING_PAYMENT_STORAGE_PREFIX}:v${STORAGE_VERSION}:${encodeURIComponent(scope.product)}:${encodeURIComponent(scope.userId)}`;
}

function isPendingPayment(value: unknown): value is PendingPayment {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.paymentId === 'string' &&
    typeof record.provider === 'string' &&
    typeof record.amountUsd === 'number' &&
    typeof record.createdAt === 'string' &&
    (record.state === 'created' ||
      record.state === 'returned' ||
      record.state === 'cancelled' ||
      record.state === 'credited') &&
    (record.payCurrency === undefined || typeof record.payCurrency === 'string') &&
    (record.lastCreditedBalance === undefined || typeof record.lastCreditedBalance === 'number') &&
    (record.lastCreditedAt === undefined || typeof record.lastCreditedAt === 'string') &&
    (record.lastCreditedTransactionId === undefined ||
      typeof record.lastCreditedTransactionId === 'string')
  );
}

function read(scope: PendingPaymentScope): PendingPayment[] {
  if (!isBrowser()) return [];

  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(scope)) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      (value as { version?: unknown }).version === STORAGE_VERSION &&
      Array.isArray((value as { records?: unknown }).records)
    ) {
      return (value as { records: unknown[] }).records.filter(isPendingPayment).slice(-50);
    }
  } catch {
    // Corrupt or old storage is intentionally ignored rather than blocking billing.
  }

  return [];
}

function write(scope: PendingPaymentScope, records: PendingPayment[]): void {
  if (!isBrowser()) return;
  try {
    // Keep the most recent records only. They are reconciliation metadata, not a receipt archive.
    localStorage.setItem(
      storageKey(scope),
      JSON.stringify({
        version: STORAGE_VERSION,
        records: records.slice(-50),
      }),
    );
    pendingPaymentsRevision.update((revision) => revision + 1);
  } catch {
    // Storage can be unavailable in privacy modes; hosted checkout must still proceed.
  }
}

function recordsMatch(left: PendingPayment[], right: PendingPayment[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function writeIfChanged(scope: PendingPaymentScope, records: PendingPayment[]): boolean {
  if (recordsMatch(read(scope), records)) return false;
  write(scope, records);
  return true;
}

export function getPendingPaymentScope(): PendingPaymentScope | null {
  return getPaymentStorageScope();
}

export function getPendingPayments(scope: PendingPaymentScope): PendingPayment[] {
  return read(scope);
}

export function savePendingPayment(scope: PendingPaymentScope, payment: PendingPayment): void {
  const existing = read(scope).filter((record) => record.paymentId !== payment.paymentId);
  writeIfChanged(scope, [...existing, payment]);
}

export function markPendingPaymentReturned(scope: PendingPaymentScope, paymentId: string): boolean {
  const records = read(scope);
  return writeIfChanged(
    scope,
    records.map((record) =>
      record.paymentId === paymentId && record.state === 'created'
        ? { ...record, state: 'returned' as const }
        : record,
    ),
  );
}

export function markPendingPaymentCancelled(
  scope: PendingPaymentScope,
  paymentId: string,
): boolean {
  const records = read(scope);
  return writeIfChanged(
    scope,
    records.map((record) =>
      record.paymentId === paymentId && record.state !== 'credited'
        ? { ...record, state: 'cancelled' as const }
        : record,
    ),
  );
}

/**
 * Only transaction payment IDs establish a settlement match. Event timing is
 * deliberately not used because a payment can be credited in multiple parts.
 */
export function reconcilePendingPayments(
  scope: PendingPaymentScope,
  transactions: TransactionResponse[],
): PendingPayment[] {
  const transactionsByPaymentId = new Map<string, TransactionResponse>();
  for (const transaction of transactions) {
    if (transaction.transaction_type !== 'topup' || !transaction.payment_id) continue;
    const currentTime = Date.parse(transaction.created_at);
    // A malformed timestamp must never outrank a valid partial-credit record.
    if (!Number.isFinite(currentTime)) continue;
    const existing = transactionsByPaymentId.get(transaction.payment_id);
    const existingTime = existing ? Date.parse(existing.created_at) : Number.NEGATIVE_INFINITY;
    if (
      !existing ||
      currentTime > existingTime ||
      (currentTime === existingTime && transaction.id > existing.id)
    ) {
      transactionsByPaymentId.set(transaction.payment_id, transaction);
    }
  }

  const records = read(scope);
  const reconciled = records.map((record) => {
    const transaction = transactionsByPaymentId.get(record.paymentId);
    if (!transaction) return record;

    const transactionTime = Date.parse(transaction.created_at);
    if (!Number.isFinite(transactionTime)) return record;
    const lastTime = record.lastCreditedAt
      ? Date.parse(record.lastCreditedAt)
      : Number.NEGATIVE_INFINITY;
    if (
      record.state === 'credited' &&
      (transactionTime < lastTime ||
        (transactionTime === lastTime &&
          record.lastCreditedTransactionId !== undefined &&
          transaction.id <= record.lastCreditedTransactionId))
    ) {
      return record;
    }

    return {
      ...record,
      state: 'credited' as const,
      lastCreditedBalance: transaction.balance_after,
      lastCreditedAt: transaction.created_at,
      lastCreditedTransactionId: transaction.id,
    };
  });

  writeIfChanged(scope, reconciled);
  return reconciled;
}

/**
 * A credited record remains eligible for a short reconciliation window: partial
 * payments can legitimately emit more than one top-up event.
 */
export function hasPaymentsAwaitingReconciliation(scope: PendingPaymentScope): boolean {
  return getPendingPaymentIdsAwaitingReconciliation(scope).length > 0;
}

export function getRecentPendingPaymentIds(scope: PendingPaymentScope): string[] {
  const cutoff = Date.now() - RECONCILIATION_WINDOW_MS;
  return getPendingPayments(scope).flatMap((record) => {
    const createdAt = Date.parse(record.createdAt);
    return Number.isFinite(createdAt) && createdAt >= cutoff ? [record.paymentId] : [];
  });
}

export function getPendingPaymentIdsAwaitingReconciliation(scope: PendingPaymentScope): string[] {
  const cancelledPaymentIds = new Set(
    getPendingPayments(scope)
      .filter((record) => record.state === 'cancelled')
      .map((record) => record.paymentId),
  );
  return getRecentPendingPaymentIds(scope).filter(
    (paymentId) => !cancelledPaymentIds.has(paymentId),
  );
}

/** State-aware fallback cadence; SSE reconciliation remains immediate. */
export function getPendingPaymentPollingInterval(scope: PendingPaymentScope): number | false {
  const records = getPendingPayments(scope);
  const cutoff = Date.now() - RECONCILIATION_WINDOW_MS;
  const active = records.filter((record) => {
    const createdAt = Date.parse(record.createdAt);
    return Number.isFinite(createdAt) && createdAt >= cutoff && record.state !== 'cancelled';
  });
  if (active.some((record) => record.state === 'created' || record.state === 'returned'))
    return 30_000;
  return active.some((record) => record.state === 'credited') ? 5 * 60_000 : false;
}

/** Notify this tab when another tab writes a pending-payment record. */
export function startPendingPaymentsStorageListener(): () => void {
  if (!isBrowser()) return () => {};
  const prefix = `${PENDING_PAYMENT_STORAGE_PREFIX}:v${STORAGE_VERSION}:`;
  const onStorage = (event: StorageEvent): void => {
    if (event.storageArea !== localStorage || !event.key?.startsWith(prefix)) return;
    // Browsers do not dispatch storage events to the writing document, so this
    // cannot double-increment local writes and does not inspect unrelated keys.
    pendingPaymentsRevision.update((revision) => revision + 1);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
