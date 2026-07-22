import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import PaymentCurrencyPicker from './PaymentCurrencyPicker.svelte';
import { needsCompactCurrencyName } from './currencyNameFit';

const currencies = [
  { ticker: 'USDTTRC20', name: 'Tether', network: 'TRX', logo_url: 'https://assets.test/usdt.svg' },
  { ticker: 'USDCMATIC', name: null, network: null, logo_url: null },
];

class ResizeObserverMock {
  static observed = new Map<HTMLElement, ResizeObserverMock>();

  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {}

  observe(node: HTMLElement): void {
    ResizeObserverMock.observed.set(node, this);
  }

  unobserve(): void {}
}

beforeEach(() => {
  ResizeObserverMock.observed.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('renders Other first, checks it by default, and restores null after a currency is selected', async () => {
    render(PaymentCurrencyPicker, { currencies });

    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);
    expect(radios[0].closest('label')?.textContent).toMatch(/other/i);
    expect(radios.map((radio) => radio.value)).toEqual(['on', 'USDCMATIC', 'USDTTRC20']);

    await fireEvent.click(screen.getByRole('radio', { name: /tether/i }));
    expect(radios[0].checked).toBe(false);
    await fireEvent.click(radios[0]);
    expect(radios[0].checked).toBe(true);
  });

  it('uses compact type for a name that overflows its normal two-line area and cleans up its observer', () => {
    const longName = 'A genuinely long currency name that needs compact typography';
    const view = render(PaymentCurrencyPicker, {
      currencies: [{ ticker: 'LONG', name: longName, network: null, logo_url: null }],
    });
    const name = screen.getByText(longName);
    const observer = ResizeObserverMock.observed.get(name);
    expect(observer).toBeTruthy();

    Object.defineProperties(name, {
      clientHeight: { configurable: true, value: 31 },
      scrollHeight: { configurable: true, value: 48 },
    });
    observer?.callback([], observer as unknown as ResizeObserver);

    expect(name.classList.contains('currency-name--compact')).toBe(true);
    expect(getComputedStyle(name).textOverflow).not.toBe('ellipsis');
    view.unmount();
    expect(observer?.disconnect).toHaveBeenCalledOnce();
  });

  it('identifies overflow using measured dimensions', () => {
    expect(needsCompactCurrencyName({ clientHeight: 30, scrollHeight: 32 } as HTMLElement)).toBe(
      true,
    );
    expect(needsCompactCurrencyName({ clientHeight: 30, scrollHeight: 31 } as HTMLElement)).toBe(
      false,
    );
  });

  it('tries a refreshed logo URL for the same ticker after an earlier URL failed', async () => {
    const { rerender } = render(PaymentCurrencyPicker, { currencies });
    await fireEvent.error(screen.getByAltText('Tether logo'));
    expect(screen.queryByAltText('Tether logo')).toBeNull();

    await rerender({
      currencies: [
        { ...currencies[0], logo_url: 'https://assets.test/usdt-refreshed.svg' },
        currencies[1],
      ],
    });
    expect(screen.getByAltText('Tether logo')).toBeTruthy();
  });

  it('renders nothing when the catalog is empty', () => {
    render(PaymentCurrencyPicker, { currencies: [] });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText(/choose on payment page/i)).toBeNull();
  });
});
