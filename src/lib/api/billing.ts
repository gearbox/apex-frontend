import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';
import { throwApiError } from '$lib/api/errors';

export type StripeCheckoutResponse = components['schemas']['StripeCheckoutResponse'];
export type NowPaymentsInvoiceResponse = components['schemas']['NowPaymentsInvoiceResponse'];
export type TopUpOptionsResponse = components['schemas']['TopUpOptionsResponse'];
export type TopUpTierResponse = components['schemas']['TopUpTierResponse'];
export type PublicPaymentProvider = components['schemas']['PublicPaymentProvider'];

/** NowPayments `pay_currency` picker options — single source of truth. */
export const PAY_CURRENCIES = [
  { code: 'usdttrc20', label: 'USDT (TRC-20)' },
  { code: 'usdc', label: 'USDC' },
  { code: 'sol', label: 'SOL' },
  { code: 'ton', label: 'GRAM (TON)' },
  { code: 'eth', label: 'ETH' },
] as const;

/**
 * Fetch tiered top-up bounds and discount schedule.
 */
export async function fetchTopUpOptions(): Promise<TopUpOptionsResponse> {
  const { data, error } = await apiClient.GET('/v1/billing/topup/options');
  if (error || !data) throwApiError(error, 'Failed to fetch top-up options');
  return data;
}

/**
 * Fetch the public, runtime-aware list of enabled payment providers, ordered by display_order.
 */
export async function fetchPaymentProviders(): Promise<PublicPaymentProvider[]> {
  const { data, error } = await apiClient.GET('/v1/billing/providers');
  if (error || !data) throwApiError(error, 'Failed to fetch payment providers');
  return data;
}

/**
 * Initiate a Stripe checkout session for token top-up.
 * Returns a checkout URL to redirect the user to.
 */
export async function topUpStripe(
  body: { amount_usd: number },
  idempotencyKey: string,
): Promise<StripeCheckoutResponse> {
  const { data, error } = await apiClient.POST('/v1/billing/topup/stripe', {
    body,
    params: { header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error || !data) throwApiError(error, 'Failed to initiate Stripe checkout');
  return data as StripeCheckoutResponse;
}

/**
 * Initiate a NowPayments crypto invoice for token top-up.
 * Returns an invoice URL to redirect the user to.
 */
export async function topUpNowPayments(
  body: { amount_usd: number; pay_currency: string },
  idempotencyKey: string,
): Promise<NowPaymentsInvoiceResponse> {
  const { data, error } = await apiClient.POST('/v1/billing/topup/nowpayments', {
    body,
    params: { header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error || !data) throwApiError(error, 'Failed to initiate crypto payment');
  return data as NowPaymentsInvoiceResponse;
}

/**
 * Resolve the highest tier whose threshold_usd <= amountUsd, or null when none qualify.
 * Mirrors the backend's tier resolution in src/core/topup_pricing.py.
 */
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

/**
 * Client-side pricing preview only — the backend is authoritative for the actual charge.
 */
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
