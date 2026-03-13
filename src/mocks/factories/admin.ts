import type { components } from '$lib/api/types';

type AdminUserResponse = components['schemas']['AdminUserResponse'];
type AdminOrgResponse = components['schemas']['AdminOrgResponse'];
type GenerationModelResponse = components['schemas']['GenerationModelResponse'];
type PaymentResponse = components['schemas']['PaymentResponse'];
type BalanceResponse = components['schemas']['BalanceResponse'];
type TransactionResponse = components['schemas']['TransactionResponse'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

export function makeAdminUser(overrides: Partial<AdminUserResponse> = {}): AdminUserResponse {
  return {
    id: 'usr_admin_001',
    email: 'user@example.com',
    display_name: 'Test User',
    role: 'user',
    subscription_tier: 'free',
    is_active: true,
    email_verified_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeAdminOrg(overrides: Partial<AdminOrgResponse> = {}): AdminOrgResponse {
  return {
    id: 'org_mock_001',
    name: 'Acme Corp',
    slug: 'acme-corp',
    owner_id: 'usr_admin_001',
    is_active: true,
    member_count: 5,
    token_balance: 1250,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeGenerationModel(
  overrides: Partial<GenerationModelResponse> = {},
): GenerationModelResponse {
  return {
    model_key: 'grok-imagine-image',
    provider: 'grok',
    name: 'Grok Imagine',
    description: 'High-quality image generation model by xAI.',
    is_enabled: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
    ...overrides,
  };
}

export function makePayment(overrides: Partial<PaymentResponse> = {}): PaymentResponse {
  return {
    id: 'pay_mock_001',
    payment_provider: 'stripe',
    status: 'completed',
    amount_usd: '9.99',
    tokens_granted: 1000,
    currency: 'usd',
    created_at: '2025-01-01T00:00:00Z',
    completed_at: '2025-01-01T00:01:00Z',
    ...overrides,
  };
}

export function makeBalanceResponse(overrides: Partial<BalanceResponse> = {}): BalanceResponse {
  return {
    account_id: 'acc_mock_001',
    account_type: 'personal',
    balance: 500,
    ...overrides,
  };
}

export function makeTransactionResponse(
  overrides: Partial<TransactionResponse> = {},
): TransactionResponse {
  return {
    id: 'txn_mock_001',
    transaction_type: 'credit',
    amount: 500,
    balance_after: 500,
    description: 'Promotional credit',
    metadata: {},
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makePricingRule(overrides: Partial<PricingRuleResponse> = {}): PricingRuleResponse {
  return {
    id: 'rule_mock_001',
    provider: 'grok',
    generation_type: 't2i',
    token_cost: 10,
    is_active: true,
    effective_from: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}
