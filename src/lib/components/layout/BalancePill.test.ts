import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('@tanstack/svelte-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/svelte-query')>('@tanstack/svelte-query');
  return { ...actual, createQuery: vi.fn() };
});

vi.mock('$lib/stores/eventStream', () => ({
  isSSEConnected: {
    subscribe: (fn: (v: boolean) => void) => {
      fn(true);
      return () => {};
    },
  },
}));

vi.mock('$paraglide/messages', () => ({
  topbar_balance: ({ amount }: { amount: string }) => `Balance: ${amount}`,
  balance_debt_label: ({ n }: { n: string }) => `You owe ${n} tokens — top up`,
  balance_loading_aria_label: () => 'Loading balance',
}));

vi.mock('$paraglide/runtime', () => ({
  setLanguageTag: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

import BalancePill from './BalancePill.svelte';
import { createQuery } from '@tanstack/svelte-query';
import { ROUTES } from '$lib/utils/routes';

function mockQuery(data: Record<string, unknown> | null, isLoading = false) {
  vi.mocked(createQuery).mockReturnValue({
    get data() {
      return data;
    },
    get isLoading() {
      return isLoading;
    },
    get isError() {
      return false;
    },
  } as ReturnType<typeof createQuery>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BalancePill — positive balance', () => {
  it('renders balance value and links to ROUTES.billing', () => {
    mockQuery({ balance: 1250, account_id: 'acc_001' });
    render(BalancePill);
    const link = document.querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.href).toContain(ROUTES.billing);
    expect(link.classList.contains('debt')).toBe(false);
  });
});

describe('BalancePill — negative balance (debt)', () => {
  it('renders danger class and links to ROUTES.billingTopUp', () => {
    mockQuery({ balance: -500, account_id: 'acc_001' });
    render(BalancePill);
    const link = document.querySelector('a') as HTMLAnchorElement;
    expect(link.href).toContain(ROUTES.billingTopUp);
    expect(link.classList.contains('debt')).toBe(true);
  });

  it('sets debt aria-label', () => {
    mockQuery({ balance: -2500, account_id: 'acc_001' });
    render(BalancePill);
    const link = document.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('aria-label')).toMatch(/owe/i);
  });
});

describe('BalancePill — loading state', () => {
  it('renders skeleton when loading', () => {
    mockQuery(null, true);
    render(BalancePill);
    expect(document.querySelector('.loading-skel')).not.toBeNull();
  });

  it('uses localized aria-label while loading', () => {
    mockQuery(null, true);
    render(BalancePill);
    const link = document.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('aria-label')).toBe('Loading balance');
  });
});
