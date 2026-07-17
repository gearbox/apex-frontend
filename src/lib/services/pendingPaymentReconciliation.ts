import { fetchBillingTransactions, type TransactionResponse } from '$lib/api/billing';
import {
  getPendingPaymentIdsAwaitingReconciliation,
  getPendingPayments,
  type PendingPaymentScope,
} from '$lib/stores/pendingPayments';

const MAX_RECONCILIATION_PAGES = 10;

/**
 * Follow opaque billing cursors until every recent unresolved payment is found,
 * the history is exhausted, or the page bound is reached. Both SSE and the
 * fallback query use this exact fetcher so they cannot disagree on coverage.
 */
export async function fetchPendingPaymentTransactions(
  scope: PendingPaymentScope,
): Promise<TransactionResponse[]> {
  const unresolvedPaymentIds = new Set(getPendingPaymentIdsAwaitingReconciliation(scope));
  if (unresolvedPaymentIds.size === 0) return [];

  const createdAtTimes = getPendingPayments(scope)
    .filter((payment) => unresolvedPaymentIds.has(payment.paymentId))
    .map((payment) => Date.parse(payment.createdAt))
    .filter(Number.isFinite);
  const earliestRelevantTime = createdAtTimes.length ? Math.min(...createdAtTimes) : null;
  let cursor: string | undefined;
  const transactions: TransactionResponse[] = [];

  for (let pageNumber = 0; pageNumber < MAX_RECONCILIATION_PAGES; pageNumber += 1) {
    const page = await fetchBillingTransactions({ limit: 100, type: 'topup', cursor });
    transactions.push(...page.items);
    for (const transaction of page.items) {
      if (transaction.payment_id) unresolvedPaymentIds.delete(transaction.payment_id);
    }
    if (unresolvedPaymentIds.size === 0 || !page.has_more || !page.next_cursor) break;

    // Results are newest-first. Once a whole page predates every relevant
    // checkout, another historical cursor cannot satisfy an ID match.
    const newestPageTime = Math.max(
      ...page.items
        .map((transaction) => Date.parse(transaction.created_at))
        .filter(Number.isFinite),
    );
    if (
      earliestRelevantTime !== null &&
      Number.isFinite(newestPageTime) &&
      newestPageTime < earliestRelevantTime
    ) {
      break;
    }
    cursor = page.next_cursor;
  }

  return transactions;
}
