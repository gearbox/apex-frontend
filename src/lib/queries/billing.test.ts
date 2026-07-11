import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import {
  billingKeys,
  topUpOptionsQueryOptions,
  paymentProvidersQueryOptions,
  topUpStripeMutationOptions,
  topUpNowPaymentsMutationOptions,
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
  it('topupOptions returns a flat key', () => {
    expect(billingKeys.topupOptions()).toEqual(['topupOptions']);
  });

  it('paymentProviders returns a flat key', () => {
    expect(billingKeys.paymentProviders()).toEqual(['paymentProviders']);
  });
});

describe('topUpOptionsQueryOptions()', () => {
  it('uses the topupOptions key with a 1h staleTime', () => {
    const opts = topUpOptionsQueryOptions();
    expect(opts.queryKey).toEqual(['topupOptions']);
    expect(opts.staleTime).toBe(60 * 60 * 1000);
  });
});

describe('paymentProvidersQueryOptions()', () => {
  it('uses the paymentProviders key with a 5m staleTime', () => {
    const opts = paymentProvidersQueryOptions();
    expect(opts.queryKey).toEqual(['paymentProviders']);
    expect(opts.staleTime).toBe(5 * 60 * 1000);
  });
});

describe('topUpStripeMutationOptions()', () => {
  it('mutationFn sends a fresh Idempotency-Key header per call', async () => {
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
    await opts.mutationFn({ amount_usd: 25 });
    await opts.mutationFn({ amount_usd: 25 });

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).toBeTruthy();
    expect(capturedKeys[1]).toBeTruthy();
    expect(capturedKeys[0]).not.toBe(capturedKeys[1]);
  });
});

describe('topUpNowPaymentsMutationOptions()', () => {
  it('mutationFn sends a fresh Idempotency-Key header per call', async () => {
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
    await opts.mutationFn({ amount_usd: 30, pay_currency: 'usdc' });
    await opts.mutationFn({ amount_usd: 30, pay_currency: 'usdc' });

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).toBeTruthy();
    expect(capturedKeys[1]).toBeTruthy();
    expect(capturedKeys[0]).not.toBe(capturedKeys[1]);
  });
});
