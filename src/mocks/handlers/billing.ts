import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';

export const billingHandlers = [
  http.get(`${BASE}/v1/billing/balance`, () =>
    HttpResponse.json({
      account_id: 'acc_mock_001',
      account_type: 'personal',
      balance: 500,
      organization_name: null,
    }),
  ),

  http.get(`${BASE}/v1/billing/pricing`, () =>
    HttpResponse.json([
      {
        id: 'rule_001',
        provider: 'grok',
        generation_type: 't2i',
        model: 'aisha',
        token_cost: 5,
        is_active: true,
        effective_from: '2025-01-01T00:00:00Z',
      },
      {
        id: 'rule_002',
        provider: 'grok',
        generation_type: 't2v',
        model: null,
        token_cost: 20,
        is_active: true,
        effective_from: '2025-01-01T00:00:00Z',
      },
    ]),
  ),

  http.get(`${BASE}/v1/billing/topup/options`, () =>
    HttpResponse.json({
      min_amount_usd: 5,
      max_amount_usd: 1000,
      tokens_per_usd: 100,
      tiers: [
        { threshold_usd: 25, discount_pct: 5 },
        { threshold_usd: 50, discount_pct: 10 },
        { threshold_usd: 100, discount_pct: 15 },
      ],
    }),
  ),

  http.get(`${BASE}/v1/billing/providers`, () =>
    HttpResponse.json([
      { provider: 'stripe', display_order: 0 },
      { provider: 'nowpayments', display_order: 1 },
    ]),
  ),

  http.post(`${BASE}/v1/billing/topup/stripe`, () =>
    HttpResponse.json(
      {
        checkout_url: 'https://checkout.stripe.com/mock-session',
        session_id: 'sess_mock_001',
        payment_id: 'b6f3a2d0-1111-4a11-9a11-000000000001',
      },
      { status: 201 },
    ),
  ),

  http.post(`${BASE}/v1/billing/topup/nowpayments`, () =>
    HttpResponse.json(
      {
        invoice_url: 'https://nowpayments.io/mock-invoice',
        payment_id: 'b6f3a2d0-2222-4a11-9a11-000000000002',
      },
      { status: 201 },
    ),
  ),

  http.get(`${BASE}/v1/admin/payments/providers`, () =>
    HttpResponse.json([
      { provider: 'stripe', is_enabled: true, display_order: 0, credentials_configured: true },
      {
        provider: 'nowpayments',
        is_enabled: false,
        display_order: 1,
        credentials_configured: false,
      },
    ]),
  ),

  http.patch(`${BASE}/v1/admin/payments/providers/:provider`, async ({ request, params }) => {
    const body = (await request.json()) as { is_enabled?: boolean | null; display_order?: number };
    return HttpResponse.json({
      provider: params.provider as string,
      is_enabled: body.is_enabled ?? true,
      display_order: body.display_order ?? 0,
      credentials_configured: true,
    });
  }),
];
