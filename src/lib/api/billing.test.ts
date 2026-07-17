import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import {
  topUpStripe,
  topUpNowPayments,
  fetchTopUpOptions,
  fetchPaymentProviders,
  fetchPaymentCurrencies,
  fetchBillingTransactions,
  resolveTier,
  computeSummary,
  type TopUpTierResponse,
  type TopUpOptionsResponse,
} from './billing';

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

beforeEach(() => {
  const tokens = {
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };
  setAuth(tokens, makeUserProfile());
});

describe('fetchTopUpOptions()', () => {
  it('returns top-up bounds and tiers', async () => {
    server.use(
      http.get(`${BASE}/v1/billing/topup/options`, () =>
        HttpResponse.json({
          min_amount_usd: 5,
          max_amount_usd: 1000,
          tokens_per_usd: 100,
          tiers: [
            { threshold_usd: 25, discount_pct: 5 },
            { threshold_usd: 50, discount_pct: 10 },
          ],
        }),
      ),
    );

    const result = await fetchTopUpOptions();
    expect(result.min_amount_usd).toBe(5);
    expect(result.tiers).toHaveLength(2);
  });
});

describe('fetchPaymentProviders()', () => {
  it('sorts a copied provider list by display_order', async () => {
    server.use(
      http.get(`${BASE}/v1/billing/providers`, () =>
        HttpResponse.json([
          { provider: 'stripe', display_order: 2 },
          { provider: 'nowpayments', display_order: 1 },
        ]),
      ),
    );

    const result = await fetchPaymentProviders();
    expect(result).toHaveLength(2);
    expect(result[0].provider).toBe('nowpayments');
  });
});

describe('fetchPaymentCurrencies()', () => {
  it('calls the public currency catalog endpoint', async () => {
    server.use(
      http.get(`${BASE}/v1/billing/currencies`, () =>
        HttpResponse.json([
          { ticker: 'USDTTRC20', name: 'Tether', network: 'TRX', logo_url: null },
        ]),
      ),
    );

    await expect(fetchPaymentCurrencies()).resolves.toEqual([
      { ticker: 'USDTTRC20', name: 'Tether', network: 'TRX', logo_url: null },
    ]);
  });
});

describe('fetchBillingTransactions()', () => {
  it('passes opaque cursors without an offset or total assumption', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/v1/billing/transactions`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [],
          limit: 20,
          has_more: true,
          next_cursor: 'next:opaque',
        });
      }),
    );

    const page = await fetchBillingTransactions({ limit: 20, cursor: 'cursor:opaque' });
    expect(capturedUrl).toContain('cursor=cursor%3Aopaque');
    expect(capturedUrl).not.toContain('offset');
    expect(page.next_cursor).toBe('next:opaque');
  });
});

describe('topUpStripe()', () => {
  it('sends Idempotency-Key header and amount_usd body, returns checkout response', async () => {
    let capturedIdempotencyKey: string | null = null;
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BASE}/v1/billing/topup/stripe`, async ({ request }) => {
        capturedIdempotencyKey = request.headers.get('Idempotency-Key');
        capturedBody = await request.json();
        return HttpResponse.json(
          {
            checkout_url: 'https://checkout.stripe.com/test',
            session_id: 'sess_001',
            payment_id: 'pay_001',
          },
          { status: 201 },
        );
      }),
    );

    const result = await topUpStripe({ amount_usd: 50 }, 'test-idem-key-123');
    expect(capturedIdempotencyKey).toBe('test-idem-key-123');
    expect(capturedBody).toEqual({ amount_usd: 50 });
    expect(result).toHaveProperty('checkout_url');
  });

  it('throws ApiRequestError on 409 idempotency_conflict', async () => {
    server.use(
      http.post(`${BASE}/v1/billing/topup/stripe`, () =>
        HttpResponse.json(
          { error: 'idempotency_conflict', message: 'Key in use', status_code: 409 },
          { status: 409, headers: { 'Retry-After': '1' } },
        ),
      ),
    );

    await expect(topUpStripe({ amount_usd: 50 }, 'duplicate-key')).rejects.toThrow('Key in use');
  });

  it('throws ApiRequestError with payment_provider_disabled code on 409', async () => {
    server.use(
      http.post(`${BASE}/v1/billing/topup/stripe`, () =>
        HttpResponse.json(
          { code: 'payment_provider_disabled', provider: 'stripe' },
          { status: 409 },
        ),
      ),
    );

    await expect(topUpStripe({ amount_usd: 50 }, 'key-1')).rejects.toMatchObject({
      error: 'payment_provider_disabled',
      detail: { provider: 'stripe' },
      status_code: 409,
    });
  });

  it('preserves detail-only validation errors and their HTTP status', async () => {
    server.use(
      http.post(`${BASE}/v1/billing/topup/stripe`, () =>
        HttpResponse.json({ detail: 'Amount must be between 5 and 1000' }, { status: 400 }),
      ),
    );

    await expect(topUpStripe({ amount_usd: 1 }, 'invalid-amount')).rejects.toMatchObject({
      status_code: 400,
      message: 'Amount must be between 5 and 1000',
      detail: 'Amount must be between 5 and 1000',
    });
  });
});

describe('topUpNowPayments()', () => {
  it('sends an exact catalog ticker without extra fields, returns invoice response', async () => {
    let capturedIdempotencyKey: string | null = null;
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BASE}/v1/billing/topup/nowpayments`, async ({ request }) => {
        capturedIdempotencyKey = request.headers.get('Idempotency-Key');
        capturedBody = await request.json();
        return HttpResponse.json(
          { invoice_url: 'https://nowpayments.io/test', payment_id: 'pay_002' },
          { status: 201 },
        );
      }),
    );

    const result = await topUpNowPayments(
      { amount_usd: 50, pay_currency: 'USDTTRC20' },
      'test-idem-key-456',
    );
    expect(capturedIdempotencyKey).toBe('test-idem-key-456');
    expect(capturedBody).toEqual({ amount_usd: 50, pay_currency: 'USDTTRC20' });
    expect(result).toHaveProperty('invoice_url');
  });

  it('omits pay_currency when the user chooses it on the hosted payment page', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`${BASE}/v1/billing/topup/nowpayments`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          { invoice_url: 'https://nowpayments.io/test', payment_id: 'pay_003' },
          { status: 201 },
        );
      }),
    );

    await topUpNowPayments({ amount_usd: 50 }, 'test-idem-key-789');
    expect(capturedBody).toEqual({ amount_usd: 50 });
  });
});

describe('resolveTier()', () => {
  const tiers: TopUpTierResponse[] = [
    { threshold_usd: 25, discount_pct: 5 },
    { threshold_usd: 50, discount_pct: 10 },
    { threshold_usd: 100, discount_pct: 15 },
  ];

  it('returns null when amount is below the first threshold', () => {
    expect(resolveTier(tiers, 10)).toBeNull();
  });

  it('resolves the exact threshold boundary', () => {
    expect(resolveTier(tiers, 25)).toEqual({ threshold_usd: 25, discount_pct: 5 });
  });

  it('picks the lower tier when amount is between thresholds', () => {
    expect(resolveTier(tiers, 40)).toEqual({ threshold_usd: 25, discount_pct: 5 });
  });

  it('picks the highest tier when amount is above the max threshold', () => {
    expect(resolveTier(tiers, 500)).toEqual({ threshold_usd: 100, discount_pct: 15 });
  });
});

describe('computeSummary()', () => {
  const options: TopUpOptionsResponse = {
    min_amount_usd: 5,
    max_amount_usd: 1000,
    tokens_per_usd: 100,
    tiers: [
      { threshold_usd: 25, discount_pct: 5 },
      { threshold_usd: 50, discount_pct: 10 },
    ],
  };

  it('computes an undiscounted amount below the first tier', () => {
    expect(computeSummary(options, 10)).toEqual({
      tokensGranted: 1000,
      discountPct: 0,
      amountCharged: 10,
    });
  });

  it('computes a discounted amount at a qualifying tier', () => {
    expect(computeSummary(options, 50)).toEqual({
      tokensGranted: 5000,
      discountPct: 10,
      amountCharged: 45,
    });
  });
});
