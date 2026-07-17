import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import PaymentCurrencyPicker from './PaymentCurrencyPicker.svelte';

const currencies = [
  { ticker: 'USDTTRC20', name: 'Tether', network: 'TRX', logo_url: 'https://assets.test/usdt.svg' },
  { ticker: 'USDCMATIC', name: null, network: null, logo_url: null },
];

describe('PaymentCurrencyPicker', () => {
  it('renders catalog labels, tickers, network chips, and a fallback name', () => {
    render(PaymentCurrencyPicker, { currencies });

    expect(screen.getByText('Tether')).toBeTruthy();
    expect(screen.getByText('USDTTRC20')).toBeTruthy();
    expect(screen.getByText('TRX')).toBeTruthy();
    expect(screen.getAllByText('USDCMATIC')).toHaveLength(2);
    expect(screen.getByAltText('Tether logo')).toBeTruthy();
  });

  it('uses the generic icon when a logo fails and lets Other select null', async () => {
    render(PaymentCurrencyPicker, { currencies, value: 'USDTTRC20' });
    await fireEvent.error(screen.getByAltText('Tether logo'));
    expect(screen.queryByAltText('Tether logo')).toBeNull();

    const other = screen.getByRole('radio', { name: /other/i }) as HTMLInputElement;
    await fireEvent.click(other);
    expect(other.checked).toBe(true);
  });

  it('renders nothing when the catalog is empty', () => {
    render(PaymentCurrencyPicker, { currencies: [] });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText(/choose on payment page/i)).toBeNull();
  });
});
