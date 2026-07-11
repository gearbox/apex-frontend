import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { ApiRequestError } from '$lib/api/errors';
import type { PaymentProviderInfo } from '$lib/api/admin';

let providersData: PaymentProviderInfo[] = [];
let isPendingMock = false;
let mutateAsyncFn = vi.fn();
const invalidateQueriesMock = vi.fn();

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: invalidateQueriesMock })),
  createQuery: vi.fn((optionsFn: () => object) => {
    optionsFn();
    return {
      get data() {
        return providersData;
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
  }),
  createMutation: vi.fn((optionsFn: () => object) => {
    optionsFn();
    return {
      mutateAsync: mutateAsyncFn,
      get isPending() {
        return isPendingMock;
      },
    };
  }),
}));

vi.mock('$lib/stores/toasts', () => ({
  addToast: vi.fn(),
}));

import AdminProviderRegistry from './AdminProviderRegistry.svelte';
import { addToast } from '$lib/stores/toasts';

beforeEach(() => {
  isPendingMock = false;
  invalidateQueriesMock.mockClear();
  vi.mocked(addToast).mockClear();
  providersData = [
    { provider: 'stripe', is_enabled: true, display_order: 0, credentials_configured: true },
    {
      provider: 'nowpayments',
      is_enabled: false,
      display_order: 1,
      credentials_configured: false,
    },
  ];
  mutateAsyncFn = vi.fn().mockResolvedValue({});
});

describe('AdminProviderRegistry', () => {
  it('renders rows including a disabled provider and a credentials warning', () => {
    render(AdminProviderRegistry);

    expect(screen.getAllByText('Stripe').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NowPayments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Credentials not configured').length).toBeGreaterThan(0);
  });

  it('fires a PATCH with is_enabled: false when toggling an enabled provider', async () => {
    render(AdminProviderRegistry);

    const toggles = screen.getAllByRole('switch');
    await fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(mutateAsyncFn).toHaveBeenCalledWith({
        provider: 'stripe',
        body: { is_enabled: false },
      });
    });
  });

  it('shows a toast on mutation error', async () => {
    mutateAsyncFn = vi.fn().mockRejectedValue(
      new ApiRequestError({
        error: 'forbidden',
        message: 'Superadmin role required',
        status_code: 403,
      }),
    );

    render(AdminProviderRegistry);
    const toggles = screen.getAllByRole('switch');
    await fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'Superadmin role required',
      });
    });
  });

  it('disables the up arrow for the first row and the down arrow for the last row', () => {
    render(AdminProviderRegistry);

    const upButtons = screen.getAllByRole('button', { name: /move stripe up/i });
    const downButtons = screen.getAllByRole('button', { name: /move nowpayments down/i });

    for (const btn of upButtons) expect((btn as HTMLButtonElement).disabled).toBe(true);
    for (const btn of downButtons) expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
