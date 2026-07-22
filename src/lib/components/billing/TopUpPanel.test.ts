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
const setQueryDataMock = vi.fn();
const currenciesRefetchMock = vi.fn();

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
  })),
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
        refetch: currenciesRefetchMock,
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
  setQueryDataMock.mockClear();
  currenciesRefetchMock.mockClear();

  Object.defineProperty(window, 'location', {
    value: { assign: vi.fn(), href: '' },
    writable: true,
    configurable: true,
  });
});

describe('TopUpPanel', () => {
  it('renders only API-provided preset cards while retaining the minimum as the input placeholder', () => {
    render(TopUpPanel);

    expect(screen.queryByRole('button', { name: '$5' })).toBeNull();
    expect(screen.getByRole('button', { name: '$25' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '$50' })).toBeTruthy();
    expect(screen.getByText('-5%')).toBeTruthy();
    expect(screen.getByText('-10%')).toBeTruthy();
    expect(screen.getByLabelText('Amount (USD)').getAttribute('placeholder')).toBe('5');
  });

  it('keeps the minimum amount valid for manual entry', async () => {
    render(TopUpPanel);

    await fireEvent.input(screen.getByLabelText('Amount (USD)'), { target: { value: '5' } });

    expect(
      (screen.getByRole('button', { name: /pay with stripe/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: /pay with crypto/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('renders a minimum-value card when that tier is supplied by the API', () => {
    optionsData = {
      ...structuredClone(BASE_OPTIONS),
      tiers: [{ threshold_usd: 5, discount_pct: 0 }, ...BASE_OPTIONS.tiers],
    };

    render(TopUpPanel);

    expect(screen.getByRole('button', { name: '$5' })).toBeTruthy();
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

    expect(screen.getByText(/you pay \$45\.00/i)).toBeTruthy();
    expect(screen.getByText(/receive ◈5,000 tokens/i)).toBeTruthy();
    expect(screen.getByText(/tier discount: −10%/i)).toBeTruthy();
  });

  it('uses the lower qualifying tier between thresholds and the highest tier above them', async () => {
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '40' } });
    expect(screen.getByText(/you pay \$38\.00/i)).toBeTruthy();

    await fireEvent.input(input, { target: { value: '100' } });
    expect(screen.getByText(/you pay \$90\.00/i)).toBeTruthy();
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

  it('permanently clears a retry when the amount changes away and back', async () => {
    stripeMutateAsync = vi
      .fn()
      .mockRejectedValue(
        new ApiRequestError({ error: 'network_error', message: 'Offline', status_code: 0 }),
      );
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '50' } });
    await fireEvent.click(screen.getByRole('button', { name: /pay with stripe/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry same attempt/i })).toBeTruthy(),
    );

    await fireEvent.click(screen.getByRole('button', { name: /discard attempt/i }));
    await fireEvent.input(input, { target: { value: '25' } });
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    await fireEvent.input(input, { target: { value: '50' } });
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('clears a retry immediately when the selected currency changes', async () => {
    currenciesData = [{ ticker: 'USDTTRC20', name: 'Tether', network: 'TRX', logo_url: null }];
    nowPaymentsMutateAsync = vi
      .fn()
      .mockRejectedValue(
        new ApiRequestError({ error: 'network_error', message: 'Offline', status_code: 0 }),
      );
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '50' } });
    await fireEvent.click(screen.getByRole('button', { name: /pay with crypto/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry same attempt/i })).toBeTruthy(),
    );

    await fireEvent.click(screen.getByRole('button', { name: /discard attempt/i }));
    await fireEvent.click(screen.getByRole('radio', { name: /tether/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /retry/i })).toBeNull());
  });

  it('treats another normal Pay click as a new intent instead of a retry', async () => {
    stripeMutateAsync = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiRequestError({ error: 'network_error', message: 'Offline', status_code: 0 }),
      )
      .mockResolvedValueOnce({
        checkout_url: 'https://checkout.stripe.com/new',
        session_id: 'sess_new',
        payment_id: 'pay_new',
      });
    render(TopUpPanel);
    const input = screen.getByLabelText('Amount (USD)');
    await fireEvent.input(input, { target: { value: '50' } });
    await fireEvent.click(screen.getByRole('button', { name: /pay with stripe/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry same attempt/i })).toBeTruthy(),
    );
    const firstIntent = stripeMutateAsync.mock.calls[0][0];

    await fireEvent.click(screen.getByRole('button', { name: /discard attempt/i }));
    await fireEvent.click(screen.getByRole('button', { name: /pay with stripe/i }));
    await waitFor(() => expect(stripeMutateAsync).toHaveBeenCalledTimes(2));
    expect(stripeMutateAsync.mock.calls[1][0].idempotencyKey).not.toBe(firstIntent.idempotencyKey);
  });

  it('keeps an idempotency conflict recoverable and replays its exact intent only on Retry', async () => {
    stripeMutateAsync = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiRequestError({
          error: 'idempotency_conflict',
          message: 'Processing',
          status_code: 409,
          retry_after_seconds: 0,
        }),
      )
      .mockResolvedValueOnce({
        checkout_url: 'https://checkout.stripe.com/replay',
        session_id: 'sess-replay',
        payment_id: 'pay-replay',
      });
    render(TopUpPanel);
    await fireEvent.input(screen.getByLabelText('Amount (USD)'), { target: { value: '50' } });
    await fireEvent.click(screen.getByRole('button', { name: /pay with stripe/i }));
    await waitFor(() => expect(screen.getByText(/still processing/i)).toBeTruthy());
    const firstIntent = stripeMutateAsync.mock.calls[0][0];
    await fireEvent.click(screen.getByRole('button', { name: /retry same attempt/i }));
    await waitFor(() => expect(stripeMutateAsync).toHaveBeenCalledTimes(2));
    expect(stripeMutateAsync.mock.calls[1][0]).toEqual(firstIntent);
  });

  it('clears a stale suppressed currency, removes it from cache, and does not offer the rejected retry', async () => {
    currenciesData = [{ ticker: 'USDTTRC20', name: 'Tether', network: 'TRX', logo_url: null }];
    nowPaymentsMutateAsync = vi.fn().mockRejectedValue(
      new ApiRequestError({
        error: 'pay_currency_suppressed',
        message: 'Request failed (400)',
        status_code: 400,
        pay_currency: 'USDTTRC20',
      }),
    );
    render(TopUpPanel);
    await fireEvent.input(screen.getByLabelText('Amount (USD)'), { target: { value: '50' } });
    await fireEvent.click(screen.getByRole('radio', { name: /tether/i }));
    await fireEvent.click(screen.getByRole('button', { name: /pay with crypto/i }));
    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeTruthy());
    expect(setQueryDataMock).toHaveBeenCalledWith(['billing', 'currencies'], expect.any(Function));
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['billing', 'currencies'] });
    expect(screen.queryByRole('button', { name: /retry same attempt/i })).toBeNull();
  });

  it('renders an unavailable state when the providers list is empty', () => {
    providersData = [];
    render(TopUpPanel);

    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pay with stripe/i })).toBeNull();
  });
});
