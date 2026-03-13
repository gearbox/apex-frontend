import { http, HttpResponse } from 'msw';
import {
  makeAdminUser,
  makeAdminOrg,
  makeGenerationModel,
  makePayment,
  makeBalanceResponse,
  makeTransactionResponse,
} from '../factories/admin';
import { MOCK_BASE_URL as BASE } from '../config';

export const adminHandlers = [
  // List users
  http.get(`${BASE}/v1/admin/users`, () =>
    HttpResponse.json({
      items: [
        makeAdminUser({ id: 'usr_001', email: 'alice@example.com', role: 'admin' }),
        makeAdminUser({ id: 'usr_002', email: 'bob@example.com' }),
      ],
      total: 2,
    }),
  ),

  // Patch user
  http.patch(`${BASE}/v1/admin/users/:userId`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      makeAdminUser({
        id: params.userId as string,
        email: 'user@example.com',
        role: (body.role as string) ?? 'user',
        subscription_tier: (body.subscription_tier as string) ?? 'free',
        is_active: (body.is_active as boolean) ?? true,
      }),
    );
  }),

  // User account
  http.get(`${BASE}/v1/admin/users/:userId/account`, ({ params }) =>
    HttpResponse.json(
      makeBalanceResponse({ account_id: `acc_${params.userId}` }),
    ),
  ),

  // List organizations
  http.get(`${BASE}/v1/admin/organizations`, () =>
    HttpResponse.json({
      items: [
        makeAdminOrg({ id: 'org_001', name: 'Acme Corp' }),
        makeAdminOrg({ id: 'org_002', name: 'Beta Inc', token_balance: 0 }),
      ],
      total: 2,
    }),
  ),

  // Org account
  http.get(`${BASE}/v1/admin/organizations/:orgId/account`, ({ params }) =>
    HttpResponse.json(
      makeBalanceResponse({ account_id: `acc_${params.orgId}` }),
    ),
  ),

  // List models
  http.get(`${BASE}/v1/admin/models`, () =>
    HttpResponse.json({
      items: [
        makeGenerationModel({ model_key: 'grok-imagine-image', is_enabled: true }),
        makeGenerationModel({
          model_key: 'grok-imagine-video',
          name: 'Grok Video',
          is_enabled: false,
        }),
      ],
    }),
  ),

  // Toggle model
  http.patch(`${BASE}/v1/admin/models/:modelKey`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      makeGenerationModel({
        model_key: params.modelKey as string,
        is_enabled: body.is_enabled as boolean,
      }),
    );
  }),

  // List payments
  http.get(`${BASE}/v1/admin/payments`, () =>
    HttpResponse.json({
      items: [
        makePayment({ id: 'pay_001', status: 'completed' }),
        makePayment({ id: 'pay_002', status: 'pending', completed_at: null }),
      ],
      total: 2,
    }),
  ),

  // Get single payment
  http.get(`${BASE}/v1/admin/payments/:paymentId`, ({ params }) =>
    HttpResponse.json(makePayment({ id: params.paymentId as string })),
  ),

  // Account balance
  http.get(`${BASE}/v1/admin/accounts/:accountId/balance`, ({ params }) =>
    HttpResponse.json(
      makeBalanceResponse({ account_id: params.accountId as string, balance: 500 }),
    ),
  ),

  // Account transactions
  http.get(`${BASE}/v1/admin/accounts/:accountId/transactions`, () =>
    HttpResponse.json({
      items: [
        makeTransactionResponse({ id: 'txn_001', transaction_type: 'credit', amount: 500 }),
        makeTransactionResponse({ id: 'txn_002', transaction_type: 'debit', amount: -10 }),
      ],
      total: 2,
    }),
  ),

  // Adjust balance
  http.post(`${BASE}/v1/admin/accounts/:accountId/adjust`, async ({ request }) => {
    const body = (await request.json()) as { amount: number; description: string };
    return HttpResponse.json({
      transaction: makeTransactionResponse({
        transaction_type: 'admin_adjustment',
        amount: body.amount,
        description: body.description,
      }),
      new_balance: 500 + body.amount,
    });
  }),
];

// Named override handlers for negative-path tests
export const adminUserPatchFailHandler = http.patch(
  `${BASE}/v1/admin/users/:userId`,
  () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
);

export const adminAdjustFailHandler = http.post(
  `${BASE}/v1/admin/accounts/:accountId/adjust`,
  () => HttpResponse.json({ error: 'Bad Request' }, { status: 400 }),
);
