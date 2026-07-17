import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { AdminCurrency } from '$lib/api/admin';
import { ApiRequestError } from '$lib/api/errors';

let rows: AdminCurrency[] = [];
let suppressMutateAsync = vi.fn();
const refetchMock = vi.fn();
const queryClient = { invalidateQueries: vi.fn(), setQueryData: vi.fn() };
const mutationOrder = { value: 0 };

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: vi.fn(() => queryClient),
  createQuery: vi.fn(() => ({
    get data() {
      return rows;
    },
    isPending: false,
    isError: false,
    refetch: refetchMock,
  })),
  createMutation: vi.fn(() => {
    mutationOrder.value += 1;
    return {
      mutateAsync:
        mutationOrder.value === 1 ? vi.fn() : (...args: unknown[]) => suppressMutateAsync(...args),
      isPending: false,
    };
  }),
}));

import AdminCurrencyCatalog from './AdminCurrencyCatalog.svelte';

const baseRow = (overrides: Partial<AdminCurrency> = {}): AdminCurrency => ({
  ticker: 'USDTTRC20',
  provider: 'nowpayments',
  is_available: true,
  is_suppressed: false,
  name: 'Tether',
  network: 'TRX',
  logo_key: null,
  logo_source_url: null,
  logo_synced_at: null,
  last_seen_at: '2026-07-17T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  mutationOrder.value = 0;
  rows = [baseRow(), baseRow({ ticker: 'OLD', is_available: false, is_suppressed: true })];
  suppressMutateAsync = vi.fn().mockResolvedValue(baseRow({ is_suppressed: true }));
  refetchMock.mockClear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminCurrencyCatalog', () => {
  it('renders provider availability and Apex picker suppression as independent states', () => {
    render(AdminCurrencyCatalog);
    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.getByText('Visible')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.getByText('Suppressed')).toBeTruthy();
  });

  it('confirms and sends the exact available row when suppressing it', async () => {
    render(AdminCurrencyCatalog);
    await fireEvent.click(screen.getByRole('button', { name: /suppress USDTTRC20/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('USDTTRC20'));
    await waitFor(() =>
      expect(suppressMutateAsync).toHaveBeenCalledWith({
        provider: 'nowpayments',
        ticker: 'USDTTRC20',
        isSuppressed: true,
      }),
    );
  });

  it('keeps the table visible and refetches on a 404 suppression failure', async () => {
    suppressMutateAsync = vi
      .fn()
      .mockRejectedValue(
        new ApiRequestError({ error: 'not_found', message: 'Not found', status_code: 404 }),
      );
    render(AdminCurrencyCatalog);
    await fireEvent.click(screen.getByRole('button', { name: /suppress USDTTRC20/i }));
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    expect(screen.getAllByText('Tether')).toHaveLength(2);
  });
});
