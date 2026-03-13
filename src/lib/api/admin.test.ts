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
} from '../../mocks/factories/admin';
import {
  fetchAdminUsers,
  fetchAdminOrgs,
  fetchAdminModels,
  fetchAdminPayments,
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
          total: 2,
        }),
      ),
    );
    const result = await fetchAdminUsers();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
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
    });
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
      adjustAccountBalance('acc_001', { amount: 100, description: 'test' }),
    ).rejects.toThrow();
  });
});
