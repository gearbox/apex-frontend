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
  makeDetailedHealthResponse,
  makeHealthSnapshotResponse,
  makePaymentProviderInfo,
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
  fetchAdminList,
  grantRole,
  revokeRole,
  grantPermission,
  revokePermission,
  fetchAuditLog,
  sendBroadcast,
  fetchHealth,
  fetchHealthHistory,
  fetchPaymentProviderRegistry,
  fetchAdminCurrencyCatalog,
  refreshAdminCurrencyCatalog,
  setAdminCurrencySuppressed,
  updatePaymentProvider,
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

  it('passes cursor param correctly', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/v1/admin/users`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [makeAdminUser({ role: 'admin' })],
          has_more: false,
          next_cursor: null,
          limit: 20,
        });
      }),
    );
    const result = await fetchAdminUsers({ cursor: 'c1', limit: 20 });
    expect(result).toBeDefined();
    expect(capturedUrl).toContain('cursor=c1');
    expect(capturedUrl).not.toContain('offset');
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

  it('includes locale in body when provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/v1/admin/users/:userId`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeAdminUser({ id: 'usr_001' }));
      }),
    );
    await patchAdminUser('usr_001', { role: 'user', locale: 'ru' });
    expect(capturedBody.locale).toBe('ru');
  });

  it('omits locale from body when not provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/v1/admin/users/:userId`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeAdminUser({ id: 'usr_001' }));
      }),
    );
    await patchAdminUser('usr_001', { role: 'user' });
    expect(capturedBody).not.toHaveProperty('locale');
  });
});

describe('fetchAdminOrgs()', () => {
  it('returns a list of organizations', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/organizations`, () =>
        HttpResponse.json({
          items: [makeAdminOrg({ id: 'org_001', name: 'Acme Corp' })],
          limit: 20,
          has_more: false,
          next_cursor: null,
        }),
      ),
    );
    const result = await fetchAdminOrgs();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('name');
    expect(result.items[0]).toHaveProperty('token_balance');
  });

  it('passes cursor param correctly', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/v1/admin/organizations`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [makeAdminOrg()],
          limit: 20,
          has_more: false,
          next_cursor: null,
        });
      }),
    );
    await fetchAdminOrgs({ cursor: 'org-c1', limit: 20 });
    expect(capturedUrl).toContain('cursor=org-c1');
    expect(capturedUrl).not.toContain('offset');
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
          limit: 20,
          has_more: false,
          next_cursor: null,
        }),
      ),
    );
    const result = await fetchAdminPayments();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('status');
    expect(result.items[0]).toHaveProperty('amount_usd');
  });

  it('passes cursor param correctly', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/v1/admin/payments`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [makePayment()],
          limit: 20,
          has_more: false,
          next_cursor: null,
        });
      }),
    );
    await fetchAdminPayments({ cursor: 'pay-c1', limit: 20 });
    expect(capturedUrl).toContain('cursor=pay-c1');
    expect(capturedUrl).not.toContain('offset');
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
          limit: 20,
          has_more: false,
          next_cursor: null,
        }),
      ),
    );
    const result = await fetchAccountTransactions('acc_001', { limit: 5 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('transaction_type');
    expect(result.items[0]).toHaveProperty('amount');
  });

  it('passes cursor param instead of offset', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/v1/admin/accounts/:accountId/transactions`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [makeTransactionResponse()],
          limit: 20,
          has_more: false,
          next_cursor: null,
        });
      }),
    );
    await fetchAccountTransactions('acc_001', { cursor: 'txn-c1', limit: 5 });
    expect(capturedUrl).toContain('cursor=txn-c1');
    expect(capturedUrl).not.toContain('offset');
  });
});

describe('fetchAdminPricing()', () => {
  it('returns a list of pricing rules', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/pricing`, () =>
        HttpResponse.json([
          makePricingRule({
            id: 'rule_001',
            provider: 'grok',
            generation_type: 't2i',
            token_cost: 10,
          }),
          makePricingRule({
            id: 'rule_002',
            generation_type: 't2v',
            token_cost: 50,
            is_active: false,
          }),
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
      input_token_cost: 0,
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
      createPricingRule({
        provider: 'grok',
        generation_type: 't2i',
        token_cost: 10,
        input_token_cost: 0,
      }),
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
    const result = await adjustAccountBalance(
      'acc_001',
      {
        amount: 100,
        description: 'Test credit',
      },
      'test-idem-key',
    );
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

describe('fetchAdminList()', () => {
  it('returns a list of admin users with permissions', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/manage/admins`, () =>
        HttpResponse.json([
          {
            id: 'usr_sa_001',
            email: 'superadmin@example.com',
            display_name: 'Super Admin',
            role: 'superadmin',
            permissions: [],
            is_active: true,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'usr_a_001',
            email: 'admin@example.com',
            display_name: 'Regular Admin',
            role: 'admin',
            permissions: ['billing_adjust'],
            is_active: true,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ]),
      ),
    );
    const result = await fetchAdminList();
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('superadmin');
    expect(result[1].permissions).toContain('billing_adjust');
  });
});

describe('grantRole()', () => {
  it('returns success message', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/manage/roles/:userId/grant`, () =>
        HttpResponse.json({ message: 'Role granted.' }, { status: 201 }),
      ),
    );
    const result = await grantRole('usr_002', 'admin');
    expect(result.message).toBeTruthy();
  });

  it('throws 403 on self-modification', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/manage/roles/:userId/grant`, () =>
        HttpResponse.json(
          { error: 'self_modification', message: 'Cannot modify own role', status_code: 403 },
          { status: 403 },
        ),
      ),
    );
    await expect(grantRole('usr_self', 'admin')).rejects.toThrow();
  });
});

describe('revokeRole()', () => {
  it('returns success message', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/manage/roles/:userId/revoke`, () =>
        HttpResponse.json({ message: 'Role revoked.' }, { status: 201 }),
      ),
    );
    const result = await revokeRole('usr_002');
    expect(result.message).toBeTruthy();
  });

  it('throws 400 on last superadmin', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/manage/roles/:userId/revoke`, () =>
        HttpResponse.json(
          {
            error: 'last_superadmin',
            message: 'Cannot revoke the last superadmin',
            status_code: 400,
          },
          { status: 400 },
        ),
      ),
    );
    await expect(revokeRole('usr_last_sa')).rejects.toThrow();
  });
});

describe('grantPermission()', () => {
  it('returns success message', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/manage/permissions/:userId/grant`, () =>
        HttpResponse.json({ message: 'Permission granted.' }, { status: 201 }),
      ),
    );
    const result = await grantPermission('usr_002', 'billing_adjust');
    expect(result.message).toBeTruthy();
  });

  it('throws 400 when user is not an admin', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/manage/permissions/:userId/grant`, () =>
        HttpResponse.json(
          { error: 'not_admin', message: 'User is not an admin', status_code: 400 },
          { status: 400 },
        ),
      ),
    );
    await expect(grantPermission('usr_regular', 'billing_adjust')).rejects.toThrow();
  });
});

describe('revokePermission()', () => {
  it('returns success message', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/manage/permissions/:userId/revoke`, () =>
        HttpResponse.json({ message: 'Permission revoked.' }, { status: 201 }),
      ),
    );
    const result = await revokePermission('usr_002', 'billing_adjust');
    expect(result.message).toBeTruthy();
  });
});

describe('fetchAuditLog()', () => {
  it('returns a CursorPage of audit entries', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/manage/audit`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'audit_001',
              actor_id: 'usr_sa_001',
              target_user_id: 'usr_002',
              action: 'role.grant',
              detail: "Role changed from 'user' to 'admin'",
              source: 'api',
              created_at: '2025-06-01T12:00:00Z',
            },
          ],
          has_more: false,
          next_cursor: null,
          limit: 50,
        }),
      ),
    );
    const result = await fetchAuditLog();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].action).toBe('role.grant');
    expect(result.has_more).toBe(false);
  });

  it('passes target_user_id filter', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/v1/admin/manage/audit`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ items: [], has_more: false, next_cursor: null, limit: 50 });
      }),
    );
    await fetchAuditLog({ target_user_id: 'usr_002', limit: 10 });
    expect(capturedUrl).toContain('target_user_id');
  });

  it('passes cursor param correctly', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/v1/admin/manage/audit`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ items: [], has_more: false, next_cursor: null, limit: 50 });
      }),
    );
    await fetchAuditLog({ cursor: 'audit-cursor-2' });
    expect(capturedUrl).toContain('cursor=audit-cursor-2');
  });
});

describe('sendBroadcast()', () => {
  it('posts broadcast body and returns message', async () => {
    let requestBody: unknown = null;

    server.use(
      http.post(`${BASE}/v1/admin/broadcast`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ message: 'Broadcast queued' });
      }),
    );

    const result = await sendBroadcast(
      { level: 'warning', title: 'Test', message: 'Hello', expires_at: null },
      'test-idem-key',
    );
    expect(result.message).toBe('Broadcast queued');
    expect(requestBody).toMatchObject({
      level: 'warning',
      title: 'Test',
      message: 'Hello',
    });
  });

  it('sends Idempotency-Key header', async () => {
    let capturedKey: string | null = null;

    server.use(
      http.post(`${BASE}/v1/admin/broadcast`, async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key');
        return HttpResponse.json({ message: 'ok' });
      }),
    );

    await sendBroadcast({ level: 'info', title: 'T', message: 'M' }, 'my-bc-key');
    expect(capturedKey).toBe('my-bc-key');
  });

  it('throws ApiRequestError on error response', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/broadcast`, () =>
        HttpResponse.json(
          { error: 'Forbidden', message: 'Admin role required', status_code: 403 },
          { status: 403 },
        ),
      ),
    );
    await expect(sendBroadcast({ level: 'info', title: 'T', message: 'M' }, 'k')).rejects.toThrow();
  });
});

describe('fetchHealth()', () => {
  it('returns a DetailedHealthResponse', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/health`, () => HttpResponse.json(makeDetailedHealthResponse())),
    );
    const result = await fetchHealth();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('checked_at');
    expect(result).toHaveProperty('infrastructure');
    expect(result).toHaveProperty('gpu_sessions');
  });

  it('throws on error response', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/health`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
    );
    await expect(fetchHealth()).rejects.toThrow();
  });
});

describe('fetchHealthHistory()', () => {
  it('returns an array of HealthSnapshotResponse', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/health/history`, () =>
        HttpResponse.json([
          makeHealthSnapshotResponse({ overall_status: 'healthy' }),
          makeHealthSnapshotResponse({ overall_status: 'degraded' }),
        ]),
      ),
    );
    const result = await fetchHealthHistory({ limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('checked_at');
    expect(result[0]).toHaveProperty('overall_status');
    expect(result[1].overall_status).toBe('degraded');
  });

  it('throws on error response', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/health/history`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
    );
    await expect(fetchHealthHistory()).rejects.toThrow();
  });
});

describe('fetchPaymentProviderRegistry()', () => {
  it('returns the full registry, including disabled providers', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/payments/providers`, () =>
        HttpResponse.json([
          makePaymentProviderInfo({ provider: 'stripe', display_order: 0 }),
          makePaymentProviderInfo({
            provider: 'nowpayments',
            is_enabled: false,
            display_order: 1,
            credentials_configured: false,
          }),
        ]),
      ),
    );
    const result = await fetchPaymentProviderRegistry();
    expect(result).toHaveLength(2);
    expect(result[1].is_enabled).toBe(false);
    expect(result[1].credentials_configured).toBe(false);
  });

  it('throws on error response', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/payments/providers`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
    );
    await expect(fetchPaymentProviderRegistry()).rejects.toThrow();
  });
});

describe('updatePaymentProvider()', () => {
  it('sends a PATCH with the given body and returns the updated provider', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.patch(`${BASE}/v1/admin/payments/providers/:provider`, async ({ request, params }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          makePaymentProviderInfo({ provider: params.provider as 'stripe', is_enabled: false }),
        );
      }),
    );
    const result = await updatePaymentProvider('stripe', { is_enabled: false });
    expect(capturedBody).toEqual({ is_enabled: false });
    expect(result.is_enabled).toBe(false);
  });

  it('passes through a 400 error when neither field is supplied', async () => {
    server.use(
      http.patch(`${BASE}/v1/admin/payments/providers/:provider`, () =>
        HttpResponse.json(
          { error: 'validation_error', message: 'No fields supplied', status_code: 400 },
          { status: 400 },
        ),
      ),
    );
    await expect(updatePaymentProvider('stripe', {})).rejects.toThrow('at least one field');
  });
});

describe('payment currency catalog', () => {
  it('fetches the admin catalog and refreshes it with no request body', async () => {
    let refreshBody: unknown = 'not-called';
    server.use(
      http.get(`${BASE}/v1/admin/payments/currencies`, () =>
        HttpResponse.json([
          {
            ticker: 'USDTTRC20',
            provider: 'nowpayments',
            is_available: false,
            is_suppressed: true,
            name: null,
            network: null,
            logo_key: null,
            logo_source_url: null,
            logo_synced_at: null,
            last_seen_at: '2026-07-16T00:00:00Z',
          },
        ]),
      ),
      http.post(`${BASE}/v1/admin/payments/currencies/refresh`, async ({ request }) => {
        refreshBody = await request.text();
        return HttpResponse.json([{ provider: 'nowpayments', upserted: 2, deactivated: 1 }], {
          status: 201,
        });
      }),
    );

    await expect(fetchAdminCurrencyCatalog()).resolves.toMatchObject([
      { ticker: 'USDTTRC20', is_available: false, is_suppressed: true },
    ]);
    await expect(refreshAdminCurrencyCatalog()).resolves.toEqual([
      { provider: 'nowpayments', upserted: 2, deactivated: 1 },
    ]);
    expect(refreshBody).toBe('');
  });

  it('preserves a 502 detail from refresh failures', async () => {
    server.use(
      http.post(`${BASE}/v1/admin/payments/currencies/refresh`, () =>
        HttpResponse.json({ detail: 'NowPayments unavailable' }, { status: 502 }),
      ),
    );
    await expect(refreshAdminCurrencyCatalog()).rejects.toMatchObject({
      status_code: 502,
      message: 'NowPayments unavailable',
    });
  });

  it('patches the exact provider/ticker row and preserves a 404 status', async () => {
    let path = '';
    let body: unknown;
    server.use(
      http.patch(
        `${BASE}/v1/admin/payments/currencies/:provider/:ticker`,
        async ({ params, request }) => {
          path = `${params.provider}/${params.ticker}`;
          body = await request.json();
          return HttpResponse.json({
            ticker: params.ticker,
            provider: params.provider,
            is_available: true,
            is_suppressed: true,
            name: null,
            network: null,
            logo_key: null,
            logo_source_url: null,
            logo_synced_at: null,
            last_seen_at: '2026-07-17T00:00:00Z',
          });
        },
      ),
    );
    await expect(
      setAdminCurrencySuppressed('nowpayments', 'USDTTRC20', { is_suppressed: true }),
    ).resolves.toMatchObject({ ticker: 'USDTTRC20', is_suppressed: true });
    expect(path).toBe('nowpayments/USDTTRC20');
    expect(body).toEqual({ is_suppressed: true });

    server.use(
      http.patch(`${BASE}/v1/admin/payments/currencies/:provider/:ticker`, () =>
        HttpResponse.json({ detail: 'Unknown ticker' }, { status: 404 }),
      ),
    );
    await expect(
      setAdminCurrencySuppressed('nowpayments', 'NEVER_SEEN', { is_suppressed: true }),
    ).rejects.toMatchObject({ status_code: 404 });
  });
});
