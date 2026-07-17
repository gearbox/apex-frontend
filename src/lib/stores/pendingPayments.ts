import { get, writable } from 'svelte/store';
import { getCurrentUser } from '$lib/stores/auth';
import { productInfo } from '$lib/stores/product';
import { isBrowser } from '$lib/utils/env';
import type { TransactionResponse } from '$lib/api/billing';

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'apex:pending-payments';
const RECONCILIATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PendingPaymentScope {
  userId: string;
  product: string;
}

export interface PendingPayment {
  paymentId: string;
  provider: string;
  amountUsd: number;
  payCurrency?: string;
  createdAt: string;
  state: 'created' | 'returned' | 'credited';
  lastCreditedBalance?: number;
}

interface PendingPaymentStorage {
  version: typeof STORAGE_VERSION;
  records: PendingPayment[];
}

/** Bumped after local changes so pages can enable temporary reconciliation polling. */
export const pendingPaymentsRevision = writable(0);

function storageKey(scope: PendingPaymentScope): string {
  return `${STORAGE_PREFIX}:v${STORAGE_VERSION}:${encodeURIComponent(scope.product)}:${encodeURIComponent(scope.userId)}`;
}

function isPendingPayment(value: unknown): value is PendingPayment {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.paymentId === 'string' &&
    typeof record.provider === 'string' &&
    typeof record.amountUsd === 'number' &&
    typeof record.createdAt === 'string' &&
    (record.state === 'created' || record.state === 'returned' || record.state === 'credited') &&
    (record.payCurrency === undefined || typeof record.payCurrency === 'string') &&
    (record.lastCreditedBalance === undefined || typeof record.lastCreditedBalance === 'number')
  );
}

function read(scope: PendingPaymentScope): PendingPaymentStorage {
  if (!isBrowser()) return { version: STORAGE_VERSION, records: [] };

  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(scope)) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      (value as { version?: unknown }).version === STORAGE_VERSION &&
      Array.isArray((value as { records?: unknown }).records)
    ) {
      return {
        version: STORAGE_VERSION,
        records: (value as { records: unknown[] }).records.filter(isPendingPayment),
      };
    }
  } catch {
    // Corrupt or old storage is intentionally ignored rather than blocking billing.
  }

  return { version: STORAGE_VERSION, records: [] };
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
      } satisfies PendingPaymentStorage),
    );
    pendingPaymentsRevision.update((revision) => revision + 1);
  } catch {
    // Storage can be unavailable in privacy modes; hosted checkout must still proceed.
  }
}

export function getPendingPaymentScope(): PendingPaymentScope | null {
  const user = getCurrentUser();
  if (!user?.id) return null;

  const product = get(productInfo)?.product ?? (isBrowser() ? window.location.host : null);
  return product ? { userId: user.id, product } : null;
}

export function getPendingPayments(scope: PendingPaymentScope): PendingPayment[] {
  return read(scope).records;
}

export function savePendingPayment(scope: PendingPaymentScope, payment: PendingPayment): void {
  const existing = read(scope).records.filter((record) => record.paymentId !== payment.paymentId);
  write(scope, [...existing, payment]);
}

export function markPendingPaymentReturned(scope: PendingPaymentScope, paymentId: string): void {
  const records = read(scope).records;
  write(
    scope,
    records.map((record) =>
      record.paymentId === paymentId && record.state === 'created'
        ? { ...record, state: 'returned' as const }
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
  const transactionsByPaymentId = new Map(
    transactions
      .filter((transaction) => transaction.payment_id)
      .map((transaction) => [transaction.payment_id!, transaction]),
  );
  const records = read(scope).records;
  const reconciled = records.map((record) => {
    const transaction = transactionsByPaymentId.get(record.paymentId);
    return transaction
      ? {
          ...record,
          state: 'credited' as const,
          lastCreditedBalance: transaction.balance_after,
        }
      : record;
  });

  write(scope, reconciled);
  return reconciled;
}

/**
 * A credited record remains eligible for a short reconciliation window: partial
 * payments can legitimately emit more than one top-up event.
 */
export function hasPaymentsAwaitingReconciliation(scope: PendingPaymentScope): boolean {
  const cutoff = Date.now() - RECONCILIATION_WINDOW_MS;
  return getPendingPayments(scope).some((record) => {
    const createdAt = Date.parse(record.createdAt);
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
}
