import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { themes } from '$lib/themes';
import { themePrefs } from '$lib/stores/theme';
import ThemeSelector from './ThemeSelector.svelte';

vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});

afterEach(() => {
  cleanup();
  themePrefs.set({ theme: 'slate', mode: 'dark' });
});

describe('ThemeSelector', () => {
  it('renders one card per theme in definition order with its label and description', () => {
    const { container } = render(ThemeSelector);
    const cards = Array.from(container.querySelectorAll('.theme-card'));

    expect(cards).toHaveLength(Object.values(themes).length);
    expect(
      cards.map((card) => ({
        label: card.querySelector('.theme-name')?.textContent?.trim(),
        description: card.querySelector('.theme-desc')?.textContent?.trim(),
      })),
    ).toEqual(Object.values(themes).map(({ label, description }) => ({ label, description })));
  });
});
