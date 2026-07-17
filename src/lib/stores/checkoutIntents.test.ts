import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCheckoutIntent,
  consumeStripeReturnPointer,
  getCheckoutIntent,
  saveCheckoutIntent,
  saveStripeReturnPointer,
} from './checkoutIntents';
import type { PaymentStorageScope } from './paymentScope';

const scope: PaymentStorageScope = { userId: 'user-a', product: 'product-a' };

beforeEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe('checkout intent storage', () => {
  it('restores the exact versioned key/body pair for an explicit retry', () => {
    saveCheckoutIntent(scope, {
      provider: 'nowpayments',
      body: { amount_usd: 25, pay_currency: 'USDTTRC20' },
      idempotencyKey: 'same-intent',
      createdAt: new Date().toISOString(),
      retryable: true,
    });

    expect(getCheckoutIntent(scope)).toMatchObject({
      provider: 'nowpayments',
      body: { amount_usd: 25, pay_currency: 'USDTTRC20' },
      idempotencyKey: 'same-intent',
    });
  });

  it('drops expired or explicitly invalidated retry intents', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveCheckoutIntent(scope, {
      provider: 'stripe',
      body: { amount_usd: 25 },
      idempotencyKey: 'expired',
      createdAt: new Date().toISOString(),
      retryable: true,
    });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(getCheckoutIntent(scope)).toBeNull();

    saveCheckoutIntent(scope, {
      provider: 'stripe',
      body: { amount_usd: 25 },
      idempotencyKey: 'clear-me',
      createdAt: new Date().toISOString(),
      retryable: true,
    });
    clearCheckoutIntent(scope);
    expect(getCheckoutIntent(scope)).toBeNull();
  });

  it('consumes only one tab-local Stripe return pointer', () => {
    saveStripeReturnPointer(scope, 'pay-exact');
    expect(consumeStripeReturnPointer(scope)).toBe('pay-exact');
    expect(consumeStripeReturnPointer(scope)).toBeNull();
  });

  it('removes corrupt, expired, and tampered stored values instead of restoring them', () => {
    const intentKey = 'apex:checkout-intent:v1:product-a:user-a';
    sessionStorage.setItem(
      intentKey,
      JSON.stringify({
        version: 1,
        intent: {
          provider: 'stripe',
          body: { amount_usd: 25, unexpected: true },
          idempotencyKey: 'safe-key',
          createdAt: new Date().toISOString(),
          retryable: true,
        },
      }),
    );
    expect(getCheckoutIntent(scope)).toBeNull();
    expect(sessionStorage.getItem(intentKey)).toBeNull();

    const pointerKey = 'apex:stripe-return:v1:product-a:user-a';
    sessionStorage.setItem(pointerKey, '{not json');
    expect(consumeStripeReturnPointer(scope)).toBeNull();
    expect(sessionStorage.getItem(pointerKey)).toBeNull();
  });
});
