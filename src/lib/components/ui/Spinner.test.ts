import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Spinner, { type SpinnerSize } from './Spinner.svelte';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-7 w-7',
  '2xl': 'h-8 w-8',
  '3xl': 'h-10 w-10',
};

describe('Spinner', () => {
  it.each(Object.entries(SIZE_CLASSES))('maps %s to %s', (size, expectedClass) => {
    const { container } = render(Spinner, { size: size as SpinnerSize });
    const spinner = container.querySelector('span');

    expect(
      expectedClass.split(' ').every((className) => spinner?.classList.contains(className)),
    ).toBe(true);
  });

  it('uses the inverse border color when requested', () => {
    const { container } = render(Spinner, { tone: 'inverse' });
    const spinner = container.querySelector('span');

    expect(spinner?.classList.contains('border-white')).toBe(true);
    expect(spinner?.classList.contains('border-accent')).toBe(false);
  });

  it('announces a supplied label', () => {
    render(Spinner, { label: 'Loading results' });

    expect(screen.getByRole('status').textContent).toContain('Loading results');
  });

  it('is hidden from assistive technology without a label', () => {
    const { container } = render(Spinner);

    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
  });
});
