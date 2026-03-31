import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';
import { parseApiError, ApiRequestError } from '$lib/api/errors';

function throwApiError(error: unknown, fallbackMsg: string): never {
  const apiErr = parseApiError(error, 0);
  throw new ApiRequestError({ ...apiErr, message: apiErr.message || fallbackMsg });
}

export type StripeCheckoutResponse = components['schemas']['StripeCheckoutResponse'];
export type NowPaymentsInvoiceResponse = components['schemas']['NowPaymentsInvoiceResponse'];

/**
 * Initiate a Stripe checkout session for token top-up.
 * Returns a checkout URL to redirect the user to.
 */
export async function topUpStripe(
  body: { package_id: string },
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
  body: { package_id: string; pay_currency: string },
  idempotencyKey: string,
): Promise<NowPaymentsInvoiceResponse> {
  const { data, error } = await apiClient.POST('/v1/billing/topup/nowpayments', {
    body,
    params: { header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error || !data) throwApiError(error, 'Failed to initiate crypto payment');
  return data as NowPaymentsInvoiceResponse;
}
