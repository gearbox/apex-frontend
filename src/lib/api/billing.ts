import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';
import { throwApiError } from '$lib/api/errors';

export type StripeCheckoutResponse = components['schemas']['StripeCheckoutResponse'];
export type NowPaymentsInvoiceResponse = components['schemas']['NowPaymentsInvoiceResponse'];
export type TopUpOptionsResponse = components['schemas']['TopUpOptionsResponse'];
export type TopUpTierResponse = components['schemas']['TopUpTierResponse'];
export type PublicPaymentProvider = components['schemas']['PublicPaymentProvider'];
export type PublicCurrency = components['schemas']['PublicCurrency'];
export type BalanceResponse = components['schemas']['BalanceResponse'];
export type TransactionResponse = components['schemas']['TransactionResponse'];
export type TransactionListResponse =
  components['schemas']['CursorPage_src.api.schemas.billing.TransactionResponse_'];
export type TopUpStripeRequest = components['schemas']['TopUpStripeRequest'];
export type TopUpNowPaymentsRequest = components['schemas']['TopUpNowPaymentsRequest'];

/** Fetch tiered top-up bounds and discount schedule. */
export async function fetchTopUpOptions(): Promise<TopUpOptionsResponse> {
  const { data, error, response } = await apiClient.GET('/v1/billing/topup/options');
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to fetch top-up options', status);
  return data;
}

/** Fetch runtime-enabled payment providers in their configured display order. */
export async function fetchPaymentProviders(): Promise<PublicPaymentProvider[]> {
  const { data, error, response } = await apiClient.GET('/v1/billing/providers');
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to fetch payment providers', status);
  return [...data].sort((a, b) => a.display_order - b.display_order);
}

/** Fetch the optional NowPayments currency catalog. An empty list is a valid degraded mode. */
export async function fetchPaymentCurrencies(): Promise<PublicCurrency[]> {
  const { data, error, response } = await apiClient.GET('/v1/billing/currencies');
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to fetch payment currencies', status);
  return data;
}

export async function fetchBillingBalance(): Promise<BalanceResponse> {
  const { data, error, response } = await apiClient.GET('/v1/billing/balance');
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to fetch billing balance', status);
  return data;
}

export async function fetchBillingTransactions(
  params: { limit?: number; type?: string; cursor?: string } = {},
): Promise<TransactionListResponse> {
  const { data, error, response } = await apiClient.GET('/v1/billing/transactions', {
    params: { query: params },
  });
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to fetch billing transactions', status);
  return data;
}

/** Initiate a Stripe checkout session for a stable user intent. */
export async function topUpStripe(
  body: TopUpStripeRequest,
  idempotencyKey: string,
): Promise<StripeCheckoutResponse> {
  const { data, error, response } = await apiClient.POST('/v1/billing/topup/stripe', {
    body,
    params: { header: { 'Idempotency-Key': idempotencyKey } },
  });
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to initiate Stripe checkout', status);
  return data;
}

/** Initiate a NowPayments invoice. `pay_currency` is intentionally optional. */
export async function topUpNowPayments(
  body: TopUpNowPaymentsRequest,
  idempotencyKey: string,
): Promise<NowPaymentsInvoiceResponse> {
  const { data, error, response } = await apiClient.POST('/v1/billing/topup/nowpayments', {
    body,
    params: { header: { 'Idempotency-Key': idempotencyKey } },
  });
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to initiate crypto payment', status);
  return data;
}

/** Resolve the highest tier whose threshold_usd <= amountUsd, or null when none qualify. */
export function resolveTier(
  tiers: TopUpTierResponse[],
  amountUsd: number,
): TopUpTierResponse | null {
  let resolved: TopUpTierResponse | null = null;
  for (const tier of tiers) {
    if (tier.threshold_usd <= amountUsd) {
      if (!resolved || tier.threshold_usd > resolved.threshold_usd) resolved = tier;
    }
  }
  return resolved;
}

/** Client-side pricing preview only — the backend remains authoritative. */
export function computeSummary(
  options: TopUpOptionsResponse,
  amountUsd: number,
): {
  tokensGranted: number;
  discountPct: number;
  amountCharged: number;
} {
  const tier = resolveTier(options.tiers, amountUsd);
  const discountPct = tier?.discount_pct ?? 0;
  return {
    tokensGranted: amountUsd * options.tokens_per_usd,
    discountPct,
    amountCharged: amountUsd * (1 - discountPct / 100),
  };
}
