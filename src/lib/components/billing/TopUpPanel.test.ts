import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { ApiRequestError } from '$lib/api/errors';
import type { PublicCurrency, TopUpOptionsResponse, PublicPaymentProvider } from '$lib/api/billing';

let optionsData: TopUpOptionsResponse | null = null;
let optionsPending = false;
let optionsErrored = false;
let providersData: PublicPaymentProvider[] = [];
let providersPending = false;
let currenciesData: PublicCurrency[] = [];

let stripeMutateAsync = vi.fn();
let nowPaymentsMutateAsync = vi.fn();
let stripePendingMock = false;
let nowPaymentsPendingMock = false;
const invalidateQueriesMock = vi.fn();

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: invalidateQueriesMock })),
  createQuery: vi.fn((optionsFn: () => { queryKey: unknown[] }) => {
    const opts = optionsFn();
    const key = JSON.stringify(opts.queryKey);
    if (key.includes('payment-providers')) {
      return {
        get data() {
          return providersData;
        },
        isPending: providersPending,
      };
    }
    if (key.includes('currencies')) {
      return {
        get data() {
          return currenciesData;
        },
        isPending: false,
        isError: false,
      };
    }
    return {
      get data() {
        return optionsData;
      },
      isPending: optionsPending,
      isError: optionsErrored,
      refetch: vi.fn(),
    };
  }),
  createMutation: vi.fn((optionsFn: () => object) => {
    optionsFn();
    // First createMutation() call in the component is Stripe, second is NowPayments.
    const callIndex = (createMutationCallOrder.count += 1);
    if (callIndex === 1) {
      return {
        mutateAsync: stripeMutateAsync,
        get isPending() {
          return stripePendingMock;
        },
      };
    }
    return {
      mutateAsync: nowPaymentsMutateAsync,
      get isPending() {
        return nowPaymentsPendingMock;
      },
    };
  }),
}));

const createMutationCallOrder = { count: 0 };

import TopUpPanel from './TopUpPanel.svelte';

const BASE_OPTIONS: TopUpOptionsResponse = {
  min_amount_usd: 5,
  max_amount_usd: 1000,
  tokens_per_usd: 100,
  tiers: [
    { threshold_usd: 25, discount_pct: 5 },
    { threshold_usd: 50, discount_pct: 10 },
  ],
};

const BASE_PROVIDERS: PublicPaymentProvider[] = [
  { provider: 'stripe', display_order: 0 },
  { provider: 'nowpayments', display_order: 1 },
];

beforeEach(() => {
  createMutationCallOrder.count = 0;
  optionsData = structuredClone(BASE_OPTIONS);
  optionsPending = false;
  optionsErrored = false;
  providersData = structuredClone(BASE_PROVIDERS);
  providersPending = false;
  currenciesData = [];
  stripePendingMock = false;
  nowPaymentsPendingMock = false;
  stripeMutateAsync = vi.fn().mockResolvedValue({
    checkout_url: 'https://checkout.stripe.com/mock',
    session_id: 'sess_1',
    payment_id: 'pay_1',
  });
  nowPaymentsMutateAsync = vi.fn().mockResolvedValue({
    invoice_url: 'https://nowpayments.io/mock',
    payment_id: 'pay_2',
  });
  invalidateQueriesMock.mockClear();

  Object.defineProperty(window, 'location', {
    value: { assign: vi.fn(), href: '' },
    writable: true,
    configurable: true,
  });
});

describe('TopUpPanel', () => {
  it('renders preset cards from topup options, prepending the min-amount card', () => {
    render(TopUpPanel);

    expect(screen.getByText('$5')).toBeTruthy();
    expect(screen.getByText('$25')).toBeTruthy();
    expect(screen.getByText('$50')).toBeTruthy();
    expect(screen.getByText('-5%')).toBeTruthy();
    expect(screen.getByText('-10%')).toBeTruthy();
  });

  it('shows a bounds validation message for an out-of-range amount', async () => {
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '2000' } });

    expect(screen.getByText(/must be between/i)).toBeTruthy();
    expect(screen.getByText(/\$1,000/)).toBeTruthy();
  });

  it('disables checkout while the amount is invalid', async () => {
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '1' } });

    const stripeBtn = screen.getByRole('button', { name: /pay with stripe/i }) as HTMLButtonElement;
    expect(stripeBtn.disabled).toBe(true);
  });

  it('shows undiscounted summary math below the first tier', async () => {
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '10' } });

    expect(screen.getByText(/you pay \$10\.00/i)).toBeTruthy();
    expect(screen.getByText(/receive ◈1,000 tokens/i)).toBeTruthy();
  });

  it('shows discounted summary math at a qualifying tier', async () => {
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '50' } });

    expect(screen.getByText(/you pay \$50\.00/i)).toBeTruthy();
    expect(screen.getByText(/receive ◈5,000 tokens/i)).toBeTruthy();
    expect(screen.getByText(/tier discount: −10%/i)).toBeTruthy();
  });

  it('sends amount_usd on Stripe click and redirects to the checkout url', async () => {
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '50' } });
    await fireEvent.click(screen.getByRole('button', { name: /pay with stripe/i }));

    await waitFor(() => {
      expect(stripeMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'stripe',
          body: { amount_usd: 50 },
          idempotencyKey: expect.any(String),
        }),
      );
      expect(window.location.assign).toHaveBeenCalledWith('https://checkout.stripe.com/mock');
    });
  });

  it('echoes an uppercase ticker from the catalog and omits it when Other is selected', async () => {
    currenciesData = [{ ticker: 'USDTTRC20', name: 'Tether', network: 'TRX', logo_url: null }];
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '50' } });
    await fireEvent.click(screen.getByRole('radio', { name: /tether/i }));
    await fireEvent.click(screen.getByRole('button', { name: /pay with crypto/i }));

    await waitFor(() => {
      expect(nowPaymentsMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'nowpayments',
          body: { amount_usd: 50, pay_currency: 'USDTTRC20' },
        }),
      );
    });

    nowPaymentsMutateAsync.mockClear();
    await fireEvent.click(screen.getByRole('radio', { name: /other/i }));
    await fireEvent.click(screen.getByRole('button', { name: /pay with crypto/i }));
    await waitFor(() => {
      expect(nowPaymentsMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ body: { amount_usd: 50 } }),
      );
    });
  });

  it('shows a specific message and refetches providers on payment_provider_disabled', async () => {
    stripeMutateAsync = vi.fn().mockRejectedValue(
      new ApiRequestError({
        error: 'payment_provider_disabled',
        message: 'Payment provider stripe is currently disabled',
        status_code: 409,
        detail: { provider: 'stripe' },
      }),
    );

    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '50' } });
    await fireEvent.click(screen.getByRole('button', { name: /pay with stripe/i }));

    await waitFor(() => {
      expect(screen.getByText(/just disabled/i)).toBeTruthy();
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: ['billing', 'payment-providers'],
      });
    });
  });

  it('renders an unavailable state when the providers list is empty', () => {
    providersData = [];
    render(TopUpPanel);

    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pay with stripe/i })).toBeNull();
  });
});
