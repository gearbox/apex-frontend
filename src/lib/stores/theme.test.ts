import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
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

describe('initTheme', () => {
  it('applying a theme updates the theme-color meta', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    const { initTheme, setMode } = await import('./theme');
    const cleanup = initTheme('frost');
    setMode('dark');
    expect(meta.content).toBe('#080810');
    setMode('light');
    expect(meta.content).toBe('#f5f7fa');
    cleanup();
    meta.remove();
  });
  it('seeds the injected default without persisting it', async () => {
    const { initTheme } = await import('./theme');
    const cleanup = initTheme('frost');
    expect(get(themePrefs).theme).toBe('frost');
    expect(localStorage.getItem(STORAGE_KEYS.THEME_PREFS)).toBeNull();
    cleanup();
  });
  it('keeps stored user prefs', async () => {
    const prefs = { theme: 'slate', mode: 'dark' } as const;
    localStorage.setItem(STORAGE_KEYS.THEME_PREFS, JSON.stringify(prefs));
    vi.resetModules();
    const theme = await import('./theme');
    const cleanup = theme.initTheme('frost');
    expect(get(theme.themePrefs)).toEqual(prefs);
    cleanup();
  });
  it('a reload starts in the injected default', async () => {
    localStorage.removeItem(STORAGE_KEYS.THEME_PREFS);
    vi.resetModules();
    const first = await import('./theme');
    first.initTheme('frost')();
    vi.resetModules();
    const reloaded = await import('./theme');
    const cleanup = reloaded.initTheme('frost');
    expect(get(reloaded.themePrefs).theme).toBe('frost');
    expect(localStorage.getItem(STORAGE_KEYS.THEME_PREFS)).toBeNull();
    cleanup();
  });

  it('sets and updates the display font CSS variable from the selected theme', async () => {
    localStorage.removeItem(STORAGE_KEYS.THEME_PREFS);
    themePrefs.set(DEFAULT_PREFS);
    const { initTheme, setTheme } = await import('./theme');
    const cleanup = initTheme('nocturne');

    expect(document.documentElement.style.getPropertyValue('--apex-font-display')).toBe(
      "'Syne', 'DM Sans', ui-sans-serif, system-ui, sans-serif",
    );
    setTheme('frost');
    expect(document.documentElement.style.getPropertyValue('--apex-font-display')).toBe(
      "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    );
    cleanup();
  });
});
