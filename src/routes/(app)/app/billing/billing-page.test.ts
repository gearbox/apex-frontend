import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { components } from '$lib/api/types';

type TransactionResponse = components['schemas']['TransactionResponse'];

const state = vi.hoisted(() => ({
  pageUrl: new URL('http://localhost/app/billing?tab=history'),
  transactions: [] as TransactionResponse[],
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: { url: URL }) => void) => {
      fn({ url: state.pageUrl });
      return () => {};
    },
  },
}));

vi.mock('@tanstack/svelte-query', () => ({
  keepPreviousData: (data: unknown) => data,
  createQuery: vi.fn((optionsFn: () => { queryKey: readonly unknown[] }) => {
    const { queryKey } = optionsFn();
    if (queryKey[0] === 'billing' && queryKey[1] === 'transactions') {
      return {
        get data() {
          return {
            items: state.transactions,
            limit: 20,
            has_more: false,
            next_cursor: null,
          };
        },
        isLoading: false,
        isError: false,
        isFetching: false,
      };
    }
    if (queryKey[0] === 'billing' && queryKey[1] === 'balance') {
      return { data: { balance: 0, account_type: 'personal', organization_name: null } };
    }
    return { data: [], isLoading: false, isError: false };
  }),
}));

import Page from './+page.svelte';

function makeTransaction(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    transaction_type: 'credit',
    amount: 100,
    balance_after: 100,
    description: 'Top-up through the legacy provider label',
    metadata: {},
    job_id: null,
    payment_id: null,
    created_at: '2026-07-28T12:00:00Z',
    created_by: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.pageUrl = new URL('http://localhost/app/billing?tab=history');
  state.transactions = [];
});

describe('/app/billing payment-method labels', () => {
  it('uses the localized crypto label instead of the raw description', () => {
    state.transactions = [makeTransaction({ payment_method: 'crypto' })];
    render(Page);

    expect(screen.getByText('Crypto payment')).toBeTruthy();
    expect(screen.queryByText('Top-up through the legacy provider label')).toBeNull();
  });

  it('uses the localized card label instead of the raw description', () => {
    state.transactions = [makeTransaction({ payment_method: 'card' })];
    render(Page);

    expect(screen.getByText('Card payment')).toBeTruthy();
    expect(screen.queryByText('Top-up through the legacy provider label')).toBeNull();
  });

  it('uses the description when payment_method is absent', () => {
    state.transactions = [makeTransaction({ payment_method: null })];
    render(Page);

    expect(screen.getByText('Top-up through the legacy provider label')).toBeTruthy();
  });

  it('uses the description for an unrecognized payment method', () => {
    state.transactions = [makeTransaction({ payment_method: 'sepa' })];
    render(Page);

    expect(screen.getByText('Top-up through the legacy provider label')).toBeTruthy();
  });
});
