import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false }),
  });
});
import { get } from 'svelte/store';
import { applyDefaultTheme, themePrefs } from './theme';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { DEFAULT_PREFS } from '$lib/themes';
afterEach(() => {
  localStorage.removeItem(STORAGE_KEYS.THEME_PREFS);
  themePrefs.set(DEFAULT_PREFS);
});
describe('applyDefaultTheme', () => {
  it('applies a default in memory without persisting it', () => {
    localStorage.removeItem(STORAGE_KEYS.THEME_PREFS);
    applyDefaultTheme('frost');
    expect(get(themePrefs).theme).toBe('frost');
    expect(localStorage.getItem(STORAGE_KEYS.THEME_PREFS)).toBeNull();
  });
  it('leaves stored user preferences unchanged', () => {
    localStorage.setItem(STORAGE_KEYS.THEME_PREFS, JSON.stringify(DEFAULT_PREFS));
    themePrefs.set(DEFAULT_PREFS);
    applyDefaultTheme('frost');
    expect(get(themePrefs)).toEqual(DEFAULT_PREFS);
  });
});
