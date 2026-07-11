import { generateIdempotencyKey } from '$lib/utils/idempotency';
import {
  fetchTopUpOptions,
  fetchPaymentProviders,
  topUpStripe,
  topUpNowPayments,
} from '$lib/api/billing';

/* ─── Query Key Factory ─── */

export const billingKeys = {
  topupOptions: () => ['topupOptions'] as const,
  paymentProviders: () => ['paymentProviders'] as const,
};

/* ─── Query Options ─── */

export function topUpOptionsQueryOptions() {
  return {
    queryKey: billingKeys.topupOptions(),
    queryFn: () => fetchTopUpOptions(),
    staleTime: 60 * 60 * 1000,
  };
}

export function paymentProvidersQueryOptions() {
  return {
    queryKey: billingKeys.paymentProviders(),
    queryFn: () => fetchPaymentProviders(),
    staleTime: 5 * 60 * 1000,
  };
}

/* ─── Mutation Options ─── */

export function topUpStripeMutationOptions() {
  return {
    mutationFn: (body: { amount_usd: number }) => topUpStripe(body, generateIdempotencyKey()),
  };
}

export function topUpNowPaymentsMutationOptions() {
  return {
    mutationFn: (body: { amount_usd: number; pay_currency: string }) =>
      topUpNowPayments(body, generateIdempotencyKey()),
  };
}
