import { writable, derived } from 'svelte/store';
import {
  themes,
  DEFAULT_PREFS,
  applyThemeColors,
  resolveVariant,
  type ThemeName,
  type ThemeMode,
  type ThemePrefs,
  type ThemeColors,
} from '$lib/themes';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { isBrowser } from '$lib/utils/env';

/* ─── Load Persisted Prefs ─── */
function loadPrefs(): ThemePrefs {
  if (!isBrowser()) return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.THEME_PREFS);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ThemePrefs>;
    return {
      theme: parsed.theme && parsed.theme in themes ? parsed.theme : DEFAULT_PREFS.theme,
      mode: parsed.mode && ['light', 'dark', 'system'].includes(parsed.mode)
        ? parsed.mode
        : DEFAULT_PREFS.mode,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: ThemePrefs): void {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEYS.THEME_PREFS, JSON.stringify(prefs));
}

/* ─── System Preference ─── */
function getSystemPrefersDark(): boolean {
  if (!isBrowser()) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/* ─── Stores ─── */
const systemPrefersDark = writable(getSystemPrefersDark());
export const themePrefs = writable<ThemePrefs>(loadPrefs());

/** The currently resolved color set. */
export const currentColors = derived(
  [themePrefs, systemPrefersDark],
  ([$prefs, $systemDark]) => {
    const def = themes[$prefs.theme];
    const variant = resolveVariant($prefs.mode, $systemDark);
    return def[variant];
  },
);

/** Current resolved variant for conditional logic. */
export const isDark = derived(
  [themePrefs, systemPrefersDark],
  ([$prefs, $systemDark]) => resolveVariant($prefs.mode, $systemDark) === 'dark',
);

/* ─── Actions ─── */
export function setTheme(name: ThemeName): void {
  themePrefs.update((p) => {
    const next = { ...p, theme: name };
    savePrefs(next);
    return next;
  });
}

export function setMode(mode: ThemeMode): void {
  themePrefs.update((p) => {
    const next = { ...p, mode };
    savePrefs(next);
    return next;
  });
}

/**
 * Initialize the theme system. Call once in the root layout.
 * Sets up the system preference listener and applies CSS vars to the body.
 */
export function initTheme(): () => void {
  if (!isBrowser()) return () => {};

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onMediaChange = (e: MediaQueryListEvent) => systemPrefersDark.set(e.matches);
  mql.addEventListener('change', onMediaChange);

  const unsubColors = currentColors.subscribe((colors: ThemeColors) => {
    applyThemeColors(document.body, colors);
  });

  return () => {
    mql.removeEventListener('change', onMediaChange);
    unsubColors();
  };
}
