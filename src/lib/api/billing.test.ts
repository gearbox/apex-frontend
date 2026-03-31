import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { topUpStripe, topUpNowPayments } from './billing';

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

beforeEach(() => {
  const tokens = {
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };
  setAuth(tokens, makeUserProfile());
});

describe('topUpStripe()', () => {
  it('sends Idempotency-Key header and returns checkout response', async () => {
    let capturedIdempotencyKey: string | null = null;

    server.use(
      http.post(`${BASE}/v1/billing/topup/stripe`, ({ request }) => {
        capturedIdempotencyKey = request.headers.get('Idempotency-Key');
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

    const result = await topUpStripe({ package_id: 'pkg_001' }, 'test-idem-key-123');
    expect(capturedIdempotencyKey).toBe('test-idem-key-123');
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

    await expect(topUpStripe({ package_id: 'pkg_001' }, 'duplicate-key')).rejects.toThrow(
      'Key in use',
    );
  });
});

describe('topUpNowPayments()', () => {
  it('sends Idempotency-Key header and returns invoice response', async () => {
    let capturedIdempotencyKey: string | null = null;

    server.use(
      http.post(`${BASE}/v1/billing/topup/nowpayments`, ({ request }) => {
        capturedIdempotencyKey = request.headers.get('Idempotency-Key');
        return HttpResponse.json(
          { invoice_url: 'https://nowpayments.io/test', payment_id: 'pay_002' },
          { status: 201 },
        );
      }),
    );

    const result = await topUpNowPayments(
      { package_id: 'pkg_001', pay_currency: 'btc' },
      'test-idem-key-456',
    );
    expect(capturedIdempotencyKey).toBe('test-idem-key-456');
    expect(result).toHaveProperty('invoice_url');
  });
});
