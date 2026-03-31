import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  makeAdminUser,
  makeAdminOrg,
  makeGenerationModel,
  makePayment,
  makeBalanceResponse,
  makeTransactionResponse,
  makePricingRule,
} from '../../mocks/factories/admin';
import {
  fetchAdminUsers,
  fetchAdminOrgs,
  fetchAdminModels,
  fetchAdminPayments,
  fetchAdminPricing,
  createPricingRule,
  patchPricingRule,
  deletePricingRule,
  patchAdminUser,
  toggleAdminModel,
  fetchUserAccount,
  fetchOrgAccount,
  fetchAccountBalance,
  fetchAccountTransactions,
  adjustAccountBalance,
} from './admin';

const BASE = 'http://localhost:8000';

describe('fetchAdminUsers()', () => {
  it('returns a list of users', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/users`, () =>
        HttpResponse.json({
          items: [
            makeAdminUser({ id: 'usr_001', email: 'alice@example.com', role: 'admin' }),
            makeAdminUser({ id: 'usr_002', email: 'bob@example.com' }),
          ],
          limit: 20,
          has_more: false,
        }),
      ),
    );
    const result = await fetchAdminUsers();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('email');
    expect(result.items[0]).toHaveProperty('role');
  });

  it('passes query params correctly', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/users`, () =>
        HttpResponse.json({ items: [makeAdminUser({ role: 'admin' })], total: 1 }),
      ),
    );
    const result = await fetchAdminUsers({ role: 'admin', limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });
});

describe('patchAdminUser()', () => {
  it('returns updated user on success', async () => {
    server.use(
      http.patch(`${BASE}/v1/admin/users/:userId`, async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeAdminUser({ id: params.userId as string, role: body.role as string }),
        );
      }),
    );
    const result = await patchAdminUser('usr_001', { role: 'admin', is_active: false });
    expect(result.id).toBe('usr_001');
    expect(result.role).toBe('admin');
  });

  it('throws on error response', async () => {
    server.use(
      http.patch(`${BASE}/v1/admin/users/:userId`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
    );
    await expect(patchAdminUser('usr_001', { role: 'user' })).rejects.toThrow();
  });
});

describe('fetchAdminOrgs()', () => {
  it('returns a list of organizations', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/organizations`, () =>
        HttpResponse.json({
          items: [makeAdminOrg({ id: 'org_001', name: 'Acme Corp' })],
          total: 1,
        }),
      ),
    );
    const result = await fetchAdminOrgs();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('name');
    expect(result.items[0]).toHaveProperty('token_balance');
  });
});

describe('fetchAdminModels()', () => {
  it('returns a list of models', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/models`, () =>
        HttpResponse.json({
          items: [
            makeGenerationModel({ model_key: 'grok-imagine-image', is_enabled: true }),
            makeGenerationModel({ model_key: 'grok-imagine-video', is_enabled: false }),
          ],
        }),
      ),
    );
    const result = await fetchAdminModels();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('model_key');
    expect(result.items[0]).toHaveProperty('is_enabled');
  });
});

describe('toggleAdminModel()', () => {
  it('returns updated model', async () => {
    server.use(
      http.patch(`${BASE}/v1/admin/models/:modelKey`, async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeGenerationModel({
            model_key: params.modelKey as string,
            is_enabled: body.is_enabled as boolean,
          }),
        );
      }),
    );
    const result = await toggleAdminModel('grok-imagine-image', false);
    expect(result.model_key).toBe('grok-imagine-image');
    expect(result.is_enabled).toBe(false);
  });
});

describe('fetchAdminPayments()', () => {
  it('returns a list of payments', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/payments`, () =>
        HttpResponse.json({
          items: [makePayment({ id: 'pay_001', status: 'completed' })],
          total: 1,
        }),
      ),
    );
    const result = await fetchAdminPayments();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('status');
    expect(result.items[0]).toHaveProperty('amount_usd');
  });
});

describe('fetchUserAccount()', () => {
  it('returns balance for a user', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/users/:userId/account`, ({ params }) =>
        HttpResponse.json(makeBalanceResponse({ account_id: `acc_${params.userId}` })),
      ),
    );
    const result = await fetchUserAccount('usr_001');
    expect(result).toHaveProperty('account_id');
    expect(result).toHaveProperty('balance');
  });
});

describe('fetchOrgAccount()', () => {
  it('returns balance for an org', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/organizations/:orgId/account`, ({ params }) =>
        HttpResponse.json(makeBalanceResponse({ account_id: `acc_${params.orgId}` })),
      ),
    );
    const result = await fetchOrgAccount('org_001');
    expect(result).toHaveProperty('account_id');
    expect(result).toHaveProperty('balance');
  });
});

describe('fetchAccountBalance()', () => {
  it('returns account balance', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/accounts/:accountId/balance`, ({ params }) =>
        HttpResponse.json(
          makeBalanceResponse({ account_id: params.accountId as string, balance: 500 }),
        ),
      ),
    );
    const result = await fetchAccountBalance('acc_001');
    expect(result.account_id).toBe('acc_001');
    expect(typeof result.balance).toBe('number');
  });
});

describe('fetchAccountTransactions()', () => {
  it('returns transaction list', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/accounts/:accountId/transactions`, () =>
        HttpResponse.json({
          items: [
            makeTransactionResponse({ id: 'txn_001', transaction_type: 'credit', amount: 500 }),
          ],
          total: 1,
        }),
      ),
    );
    const result = await fetchAccountTransactions('acc_001', { limit: 5 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('transaction_type');
    expect(result.items[0]).toHaveProperty('amount');
  });
});

describe('fetchAdminPricing()', () => {
  it('returns a list of pricing rules', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/pricing`, () =>
        HttpResponse.json([
          makePricingRule({ id: 'rule_001', provider: 'grok', generation_type: 't2i', token_cost: 10 }),
          makePricingRule({ id: 'rule_002', generation_type: 't2v', token_cost: 50, is_active: false }),
        ]),
      ),
    );
    const result = await fetchAdminPricing();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('provider');
    expect(result[0]).toHaveProperty('token_cost');
    expect(result[0]).toHaveProperty('is_active');
  });

  it('passes active_only param correctly', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/pricing`, () =>
        HttpResponse.json([makePricingRule({ is_active: true })]),
      ),
    );
    const result = await fetchAdminPricing({ active_only: true });
    expect(result).toBeDefined();
    expect(result[0].is_active).toBe(true);
  });

  it('throws on error response', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/pricing`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
    );
    await expect(fetchAdminPricing()).rejects.toThrow();
  });
});

describe('createPricingRule()', () => {
  it('returns the created rule on success', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/pricing`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makePricingRule({
            id: 'rule_new',
            provider: body.provider as string,
            generation_type: body.generation_type as string,
            token_cost: body.token_cost as number,
          }),
          { status: 201 },
        );
      }),
    );
    const result = await createPricingRule({
      provider: 'grok',
      generation_type: 't2i',
      token_cost: 15,
    });
    expect(result.id).toBe('rule_new');
    expect(result.provider).toBe('grok');
    expect(result.token_cost).toBe(15);
  });

  it('throws on error response', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/pricing`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
    );
    await expect(
      createPricingRule({ provider: 'grok', generation_type: 't2i', token_cost: 10 }),
    ).rejects.toThrow();
  });
});

describe('patchPricingRule()', () => {
  it('returns updated rule on success', async () => {
    server.use(
      http.patch(`${BASE}/v1/admin/pricing/:ruleId`, async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makePricingRule({
            id: params.ruleId as string,
            token_cost: body.token_cost as number,
            is_active: body.is_active as boolean,
          }),
        );
      }),
    );
    const result = await patchPricingRule('rule_001', { token_cost: 20, is_active: false });
    expect(result.id).toBe('rule_001');
    expect(result.token_cost).toBe(20);
    expect(result.is_active).toBe(false);
  });

  it('throws on error response', async () => {
    server.use(
      http.patch(`${BASE}/v1/admin/pricing/:ruleId`, () =>
        HttpResponse.json({ error: 'not_found' }, { status: 404 }),
      ),
    );
    await expect(patchPricingRule('rule_bad', { token_cost: 5 })).rejects.toThrow();
  });
});

describe('deletePricingRule()', () => {
  it('returns success message on delete', async () => {
    server.use(
      http.delete(`${BASE}/v1/admin/pricing/:ruleId`, () =>
        HttpResponse.json({ message: 'Pricing rule deleted.' }),
      ),
    );
    const result = await deletePricingRule('rule_001');
    expect(result).toHaveProperty('message');
  });

  it('throws on error response', async () => {
    server.use(
      http.delete(`${BASE}/v1/admin/pricing/:ruleId`, () =>
        HttpResponse.json({ error: 'not_found' }, { status: 404 }),
      ),
    );
    await expect(deletePricingRule('rule_bad')).rejects.toThrow();
  });
});

describe('adjustAccountBalance()', () => {
  it('returns adjustment result', async () => {
    server.use(
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
    );
    const result = await adjustAccountBalance('acc_001', {
      amount: 100,
      description: 'Test credit',
    }, 'test-idem-key');
    expect(result).toHaveProperty('new_balance');
    expect(result).toHaveProperty('transaction');
  });

  it('throws on error response', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/accounts/:accountId/adjust`, () =>
        HttpResponse.json({ error: 'Bad Request' }, { status: 400 }),
      ),
    );
    await expect(
      adjustAccountBalance('acc_001', { amount: 100, description: 'test' }, 'test-idem-key'),
    ).rejects.toThrow();
  });

  it('sends Idempotency-Key header', async () => {
    let capturedKey: string | null = null;

    server.use(
      http.post(`${BASE}/v1/admin/accounts/:accountId/adjust`, async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key');
        const body = (await request.json()) as { amount: number; description: string };
        return HttpResponse.json({
          transaction: makeTransactionResponse({
            transaction_type: 'admin_adjustment',
            amount: body.amount,
            description: body.description,
          }),
          new_balance: 600,
        });
      }),
    );

    await adjustAccountBalance('acc_001', { amount: 100, description: 'test' }, 'my-idem-key');
    expect(capturedKey).toBe('my-idem-key');
  });

  it('throws on 409 idempotency_conflict', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/accounts/:accountId/adjust`, () =>
        HttpResponse.json(
          { error: 'idempotency_conflict', message: 'Conflict', status_code: 409 },
          { status: 409, headers: { 'Retry-After': '1' } },
        ),
      ),
    );

    await expect(
      adjustAccountBalance('acc_001', { amount: 100, description: 'test' }, 'dup-key'),
    ).rejects.toThrow('Conflict');
  });
});
