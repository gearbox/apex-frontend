import {
  fetchBillingBalance,
  fetchBillingTransactions,
  fetchPaymentCurrencies,
  fetchPaymentProviders,
  fetchTopUpOptions,
  topUpNowPayments,
  topUpStripe,
  type TopUpNowPaymentsRequest,
  type TopUpStripeRequest,
} from '$lib/api/billing';

/* ─── Query Key Factory ─── */

export const billingKeys = {
  all: ['billing'] as const,
  balance: () => ['billing', 'balance'] as const,
  transactions: (params: { limit?: number; type?: string; cursor?: string } = {}) =>
    ['billing', 'transactions', params] as const,
  topupOptions: () => ['billing', 'topup-options'] as const,
  paymentProviders: () => ['billing', 'payment-providers'] as const,
  currencies: () => ['billing', 'currencies'] as const,
};

/* ─── Query Options ─── */

export function topUpOptionsQueryOptions() {
  return {
    queryKey: billingKeys.topupOptions(),
    queryFn: fetchTopUpOptions,
    staleTime: 60 * 60 * 1000,
  };
}

export function paymentProvidersQueryOptions() {
  return {
    queryKey: billingKeys.paymentProviders(),
    queryFn: fetchPaymentProviders,
    staleTime: 5 * 60 * 1000,
  };
}

export function paymentCurrenciesQueryOptions() {
  return {
    queryKey: billingKeys.currencies(),
    queryFn: fetchPaymentCurrencies,
    // The backend refreshes this cached catalog every three hours.
    staleTime: 3 * 60 * 60 * 1000,
    retry: false,
  };
}

export function billingBalanceQueryOptions(refetchInterval: number | false = false) {
  return {
    queryKey: billingKeys.balance(),
    queryFn: fetchBillingBalance,
    staleTime: 30_000,
    refetchInterval,
    refetchOnWindowFocus: true,
  };
}

export function billingTransactionsQueryOptions(
  params: { limit?: number; type?: string; cursor?: string } = {},
  refetchInterval: number | false = false,
) {
  return {
    queryKey: billingKeys.transactions(params),
    queryFn: () => fetchBillingTransactions(params),
    staleTime: 60_000,
    refetchInterval,
    refetchOnWindowFocus: true,
  };
}

/* ─── Checkout intents ─── */

/**
 * A checkout intent is created once for a deliberate user action. Transport
 * retries receive the exact same key/body pair instead of silently minting a
 * second payment.
 */
export interface TopUpIntent<TBody> {
  idempotencyKey: string;
  body: TBody;
}

export function topUpStripeMutationOptions() {
  return {
    mutationFn: (intent: TopUpIntent<TopUpStripeRequest>) =>
      topUpStripe(intent.body, intent.idempotencyKey),
    retry: false,
  };
}

export function topUpNowPaymentsMutationOptions() {
  return {
    mutationFn: (intent: TopUpIntent<TopUpNowPaymentsRequest>) =>
      topUpNowPayments(intent.body, intent.idempotencyKey),
    retry: false,
  };
}
