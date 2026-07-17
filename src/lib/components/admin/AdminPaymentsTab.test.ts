import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { setUser, type UserProfile } from '$lib/stores/auth';
import type { PaymentResponse } from '$lib/api/admin';

const mocks = vi.hoisted(() => ({
  registryQueryFn: vi.fn(),
  queryOptions: [] as Array<Record<string, unknown>>,
  providers: [] as Array<{ provider: string }>,
  payments: [] as PaymentResponse[],
}));

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn((optionsFactory: () => Record<string, unknown>) => {
    const options = optionsFactory();
    mocks.queryOptions.push(options);
    const isProviders = mocks.queryOptions.length === 1;
    return {
      get data() {
        return isProviders
          ? mocks.providers
          : { items: mocks.payments, has_more: false, next_cursor: null, limit: 20 };
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  }),
}));

vi.mock('$lib/queries/admin', () => ({
  adminPaymentProvidersQueryOptions: () => ({
    queryKey: ['admin', 'payment-providers'],
    queryFn: mocks.registryQueryFn,
  }),
  adminPaymentsQueryOptions: () => ({
    queryKey: ['admin', 'payments'],
    queryFn: vi.fn(),
  }),
}));

import AdminPaymentsTab from './AdminPaymentsTab.svelte';

const admin: UserProfile = {
  id: 'admin-a',
  email: 'admin@example.com',
  display_name: null,
  role: 'admin',
  subscription_tier: 'free',
  email_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  age_verified: true,
};

function payment(provider: string, currency: string, status = 'pending'): PaymentResponse {
  return {
    id: `${provider}-${currency}`,
    account_id: 'account-a',
    payment_provider: provider,
    provider_payment_id: 'provider-id',
    amount_usd: '12.3400',
    currency,
    tokens_granted: 1234,
    status,
    created_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    metadata: {},
  } as PaymentResponse;
}

beforeEach(() => {
  mocks.queryOptions.length = 0;
  mocks.registryQueryFn.mockReset();
  mocks.providers = [];
  mocks.payments = [];
  setUser(admin);
});

describe('AdminPaymentsTab', () => {
  it('does not enable the superadmin provider registry request for a regular admin', () => {
    render(AdminPaymentsTab);

    expect(mocks.queryOptions[0].enabled).toBe(false);
    expect(mocks.registryQueryFn).not.toHaveBeenCalled();
  });

  it('keeps unknown providers filterable and renders provider-aware paid currency/status values', () => {
    mocks.payments = [
      payment('stripe', 'USD'),
      payment('nowpayments', 'USD'),
      payment('nowpayments', 'USDTTRC20', 'partially_paid'),
      payment('future-provider', 'XYZ'),
    ];
    render(AdminPaymentsTab);

    expect(screen.getByDisplayValue('')).toBeTruthy();
    expect(screen.getAllByText('USD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not yet reported').length).toBeGreaterThan(0);
    expect(screen.getAllByText('USDTTRC20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Partially paid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('future-provider').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$12.3400').length).toBeGreaterThan(0);
  });
});
