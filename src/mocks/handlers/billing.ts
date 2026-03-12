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

  http.get(`${BASE}/v1/billing/packages`, () =>
    HttpResponse.json([
      { id: 'pkg_001', name: 'Starter', tokens: 100, price_usd: '4.99' },
      { id: 'pkg_002', name: 'Pro', tokens: 500, price_usd: '19.99' },
    ]),
  ),

  http.get(`${BASE}/v1/billing/pricing`, () =>
    HttpResponse.json([
      { id: 'rule_001', provider: 'grok', generation_type: 't2i', model: 'aisha', token_cost: 5, is_active: true, effective_from: '2025-01-01T00:00:00Z' },
      { id: 'rule_002', provider: 'grok', generation_type: 't2v', model: null, token_cost: 20, is_active: true, effective_from: '2025-01-01T00:00:00Z' },
    ]),
  ),
];
