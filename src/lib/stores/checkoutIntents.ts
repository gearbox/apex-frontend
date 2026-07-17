import type { TopUpNowPaymentsRequest, TopUpStripeRequest } from '$lib/api/billing';
import { isBrowser } from '$lib/utils/env';
import type { PaymentStorageScope } from './paymentScope';

const STORAGE_VERSION = 1;
const INTENT_PREFIX = 'apex:checkout-intent';
const STRIPE_RETURN_PREFIX = 'apex:stripe-return';
export const CHECKOUT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
export const STRIPE_RETURN_POINTER_TTL_MS = 2 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

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

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isValidAmount(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1
  );
}

function isValidIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 64
  );
}

function isValidPaymentId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 256
  );
}

function isValidCreatedAt(value: unknown, ttlMs: number): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const now = Date.now();
  return timestamp <= now + CLOCK_SKEW_MS && now - timestamp <= ttlMs;
}

function isPersistedIntent(value: unknown): value is PersistedCheckoutIntent {
  if (!isObject(value)) return false;
  if (
    (value.provider !== 'stripe' && value.provider !== 'nowpayments') ||
    !isValidIdempotencyKey(value.idempotencyKey) ||
    !isValidCreatedAt(value.createdAt, CHECKOUT_INTENT_TTL_MS) ||
    value.retryable !== true ||
    !isObject(value.body)
  ) {
    return false;
  }

  if (value.provider === 'stripe') {
    return hasExactKeys(value.body, ['amount_usd']) && isValidAmount(value.body.amount_usd);
  }

  if (
    !hasExactKeys(
      value.body,
      Object.prototype.hasOwnProperty.call(value.body, 'pay_currency')
        ? ['amount_usd', 'pay_currency']
        : ['amount_usd'],
    )
  ) {
    return false;
  }
  return (
    isValidAmount(value.body.amount_usd) &&
    (value.body.pay_currency === undefined ||
      (typeof value.body.pay_currency === 'string' &&
        value.body.pay_currency.length > 0 &&
        value.body.pay_currency.trim() === value.body.pay_currency))
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
  const key = storageKey(INTENT_PREFIX, scope);
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      !isObject(parsed) ||
      parsed.version !== STORAGE_VERSION ||
      !isPersistedIntent(parsed.intent)
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.intent;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Storage remains optional.
    }
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
  if (!canUseSessionStorage() || !isValidPaymentId(paymentId)) return;
  try {
    sessionStorage.setItem(
      storageKey(STRIPE_RETURN_PREFIX, scope),
      JSON.stringify({ version: STORAGE_VERSION, paymentId, createdAt: new Date().toISOString() }),
    );
  } catch {
    // A missing pointer only results in the generic safe return banner.
  }
}

/** Consume exactly one tab-local Stripe return candidate. */
export function consumeStripeReturnPointer(scope: PaymentStorageScope): string | null {
  if (!canUseSessionStorage()) return null;
  const key = storageKey(STRIPE_RETURN_PREFIX, scope);
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    return isObject(parsed) &&
      parsed.version === STORAGE_VERSION &&
      isValidPaymentId(parsed.paymentId) &&
      isValidCreatedAt(parsed.createdAt, STRIPE_RETURN_POINTER_TTL_MS)
      ? parsed.paymentId
      : null;
  } catch {
    return null;
  } finally {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Storage remains optional.
    }
  }
}
