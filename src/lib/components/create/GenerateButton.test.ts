import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

vi.mock('@tanstack/svelte-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/svelte-query')>('@tanstack/svelte-query');
  return { ...actual, createQuery: vi.fn() };
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$paraglide/messages', () => ({
  create_generate: () => '✦ Generate',
  create_generating: () => 'Generating…',
  create_submitting: () => 'Submitting…',
  generate_btn_topup: () => 'Top up to generate',
}));

vi.mock('$paraglide/runtime', () => ({
  setLanguageTag: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

vi.mock('$lib/stores/generation', () => ({
  generationStore: {
    subscribe: (
      fn: (v: {
        prompt: string;
        jobStatus: null;
        progress: null;
        mode: string;
        imageCount: number;
      }) => void,
    ) => {
      fn({ prompt: 'a cool image', jobStatus: null, progress: null, mode: 't2i', imageCount: 1 });
      return () => {};
    },
  },
}));

import GenerateButton from './GenerateButton.svelte';
import { createQuery } from '@tanstack/svelte-query';
import { ROUTES } from '$lib/utils/routes';

function mockBalanceQuery(balance: number | null, isLoading = false) {
  vi.mocked(createQuery).mockReturnValue({
    get data() {
      return balance !== null ? { balance } : null;
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

describe('GenerateButton — positive balance', () => {
  it('shows Generate label and calls onclick when clicked', async () => {
    mockBalanceQuery(500);
    const onclick = vi.fn();
    render(GenerateButton, { props: { onclick, estimatedCost: 5 } });

    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.textContent).toContain('Generate');
    expect(btn.disabled).toBe(false);
    await fireEvent.click(btn);
    expect(onclick).toHaveBeenCalledOnce();
  });
});

describe('GenerateButton — zero or negative balance (debt gate)', () => {
  it('shows top-up label when balance is 0', () => {
    mockBalanceQuery(0);
    render(GenerateButton, { props: { onclick: vi.fn(), estimatedCost: 5 } });
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.textContent).toContain('Top up');
    expect(btn.disabled).toBe(false);
  });

  it('shows top-up label when balance is negative', () => {
    mockBalanceQuery(-100);
    render(GenerateButton, { props: { onclick: vi.fn(), estimatedCost: 5 } });
    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain('Top up');
  });

  it('navigates to /app/billing/buy instead of calling onclick when in top-up mode', async () => {
    const { goto } = await import('$app/navigation');
    mockBalanceQuery(0);
    const onclick = vi.fn();
    render(GenerateButton, { props: { onclick, estimatedCost: 5 } });

    const btn = screen.getByRole('button');
    await fireEvent.click(btn);
    expect(goto).toHaveBeenCalledWith(ROUTES.billingTopUp);
    expect(onclick).not.toHaveBeenCalled();
  });
});
