import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import {
  billingKeys,
  topUpOptionsQueryOptions,
  paymentProvidersQueryOptions,
  paymentCurrenciesQueryOptions,
  topUpStripeMutationOptions,
  topUpNowPaymentsMutationOptions,
  createTopUpIntent,
} from './billing';

const BASE = 'http://localhost:8000';

setAuth(
  {
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  },
  makeUserProfile(),
);

describe('billingKeys', () => {
  it('uses a coherent billing hierarchy', () => {
    expect(billingKeys.all).toEqual(['billing']);
    expect(billingKeys.topupOptions()).toEqual(['billing', 'topup-options']);
    expect(billingKeys.transactions({ cursor: 'opaque' })).toEqual([
      'billing',
      'transactions',
      { cursor: 'opaque' },
    ]);
  });

  it('keeps payment providers and currencies under billing', () => {
    expect(billingKeys.paymentProviders()).toEqual(['billing', 'payment-providers']);
    expect(billingKeys.currencies()).toEqual(['billing', 'currencies']);
  });

  it('invalidates every parameterized transaction page from the explicit root', async () => {
    const queryClient = new QueryClient();
    const first = billingKeys.transactions({ type: 'topup', cursor: 'first' });
    const second = billingKeys.transactions({ cursor: 'second' });
    queryClient.setQueryData(first, { items: [] });
    queryClient.setQueryData(second, { items: [] });

    await queryClient.invalidateQueries({ queryKey: billingKeys.transactionsRoot() });

    expect(queryClient.getQueryState(first)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(second)?.isInvalidated).toBe(true);
  });
});

describe('createTopUpIntent()', () => {
  it('keeps the caller-provided key and exact body together', () => {
    const body = { amount_usd: 25, pay_currency: 'USDTTRC20' };
    expect(createTopUpIntent(body, 'same-intent')).toEqual({ body, idempotencyKey: 'same-intent' });
  });
});

describe('topUpOptionsQueryOptions()', () => {
  it('uses the topupOptions key with a 1h staleTime', () => {
    const opts = topUpOptionsQueryOptions();
    expect(opts.queryKey).toEqual(['billing', 'topup-options']);
    expect(opts.staleTime).toBe(60 * 60 * 1000);
  });
});

describe('paymentProvidersQueryOptions()', () => {
  it('uses the paymentProviders key with a 5m staleTime', () => {
    const opts = paymentProvidersQueryOptions();
    expect(opts.queryKey).toEqual(['billing', 'payment-providers']);
    expect(opts.staleTime).toBe(5 * 60 * 1000);
  });
});

describe('topUpStripeMutationOptions()', () => {
  it('reuses the caller-owned idempotency key for a retry', async () => {
    const capturedKeys: (string | null)[] = [];
    server.use(
      http.post(`${BASE}/v1/billing/topup/stripe`, ({ request }) => {
        capturedKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(
          { checkout_url: 'https://checkout.stripe.com/x', session_id: 's1', payment_id: 'p1' },
          { status: 201 },
        );
      }),
    );

    const opts = topUpStripeMutationOptions();
    const intent = { idempotencyKey: 'same-intent', body: { amount_usd: 25 } };
    await opts.mutationFn(intent);
    await opts.mutationFn(intent);

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys).toEqual(['same-intent', 'same-intent']);
  });
});

describe('topUpNowPaymentsMutationOptions()', () => {
  it('reuses the exact NowPayments body and key for a retry', async () => {
    const capturedKeys: (string | null)[] = [];
    server.use(
      http.post(`${BASE}/v1/billing/topup/nowpayments`, ({ request }) => {
        capturedKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(
          { invoice_url: 'https://nowpayments.io/x', payment_id: 'p2' },
          { status: 201 },
        );
      }),
    );

    const opts = topUpNowPaymentsMutationOptions();
    const intent = {
      idempotencyKey: 'same-intent',
      body: { amount_usd: 30, pay_currency: 'USDC' },
    };
    await opts.mutationFn(intent);
    await opts.mutationFn(intent);

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys).toEqual(['same-intent', 'same-intent']);
  });
});

describe('paymentCurrenciesQueryOptions()', () => {
  it('does not retry a catalog failure and keeps a three-hour stale time', () => {
    const opts = paymentCurrenciesQueryOptions();
    expect(opts.retry).toBe(false);
    expect(opts.staleTime).toBe(3 * 60 * 60 * 1000);
  });
});
