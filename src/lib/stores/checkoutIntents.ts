import type { TopUpNowPaymentsRequest, TopUpStripeRequest } from '$lib/api/billing';
import { isBrowser } from '$lib/utils/env';
import type { PaymentStorageScope } from './paymentScope';

const STORAGE_VERSION = 1;
const INTENT_PREFIX = 'apex:checkout-intent';
const STRIPE_RETURN_PREFIX = 'apex:stripe-return';
const INTENT_TTL_MS = 2 * 60 * 60 * 1000;

export type PersistedCheckoutIntent =
  | {
      provider: 'stripe';
      body: TopUpStripeRequest;
      idempotencyKey: string;
      createdAt: string;
      retryable: true;
    }
  | {
      provider: 'nowpayments';
      body: TopUpNowPaymentsRequest;
      idempotencyKey: string;
      createdAt: string;
      retryable: true;
    };

function storageKey(prefix: string, scope: PaymentStorageScope): string {
  return `${prefix}:v${STORAGE_VERSION}:${encodeURIComponent(scope.product)}:${encodeURIComponent(scope.userId)}`;
}

function canUseSessionStorage(): boolean {
  return isBrowser();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPersistedIntent(value: unknown): value is PersistedCheckoutIntent {
  if (!isObject(value)) return false;
  if (
    (value.provider !== 'stripe' && value.provider !== 'nowpayments') ||
    typeof value.idempotencyKey !== 'string' ||
    typeof value.createdAt !== 'string' ||
    value.retryable !== true ||
    !isObject(value.body) ||
    typeof value.body.amount_usd !== 'number'
  ) {
    return false;
  }

  return (
    value.provider === 'stripe' ||
    value.body.pay_currency === undefined ||
    typeof value.body.pay_currency === 'string'
  );
}

export function saveCheckoutIntent(
  scope: PaymentStorageScope,
  intent: PersistedCheckoutIntent,
): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(
      storageKey(INTENT_PREFIX, scope),
      JSON.stringify({ version: STORAGE_VERSION, intent }),
    );
  } catch {
    // Storage is optional. Checkout itself must remain available in privacy modes.
  }
}

export function getCheckoutIntent(scope: PaymentStorageScope): PersistedCheckoutIntent | null {
  if (!canUseSessionStorage()) return null;
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(storageKey(INTENT_PREFIX, scope)) ?? 'null',
    );
    if (
      !isObject(parsed) ||
      parsed.version !== STORAGE_VERSION ||
      !isPersistedIntent(parsed.intent)
    ) {
      return null;
    }

    const createdAt = Date.parse(parsed.intent.createdAt);
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > INTENT_TTL_MS) {
      clearCheckoutIntent(scope);
      return null;
    }
    return parsed.intent;
  } catch {
    return null;
  }
}

export function clearCheckoutIntent(scope: PaymentStorageScope): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(storageKey(INTENT_PREFIX, scope));
  } catch {
    // Storage is optional.
  }
}

export function saveStripeReturnPointer(scope: PaymentStorageScope, paymentId: string): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(
      storageKey(STRIPE_RETURN_PREFIX, scope),
      JSON.stringify({ version: STORAGE_VERSION, paymentId }),
    );
  } catch {
    // A missing pointer only results in the generic safe return banner.
  }
}

/** Consume exactly one tab-local Stripe return candidate. */
export function consumeStripeReturnPointer(scope: PaymentStorageScope): string | null {
  if (!canUseSessionStorage()) return null;
  try {
    const key = storageKey(STRIPE_RETURN_PREFIX, scope);
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    sessionStorage.removeItem(key);
    return isObject(parsed) &&
      parsed.version === STORAGE_VERSION &&
      typeof parsed.paymentId === 'string'
      ? parsed.paymentId
      : null;
  } catch {
    return null;
  }
}
