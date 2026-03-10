/* ─── Types ─── */
export type ThemeName = 'slate' | 'frost';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderActive: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentDim: string;
  accentGlow: string;
  success: string;
  warning: string;
  danger: string;
}

export interface ThemeDefinition {
  name: ThemeName;
  label: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export interface ThemePrefs {
  theme: ThemeName;
  mode: ThemeMode;
}

/* ─── Theme Definitions ─── */
const slate: ThemeDefinition = {
  name: 'slate',
  label: 'Slate',
  light: {
    bg: '#faf8f5',
    surface: '#ffffff',
    surfaceHover: '#f0ece6',
    border: '#e0d8cc',
    borderActive: '#c0b5a5',
    text: '#2a2520',
    textMuted: '#706558',
    textDim: '#a09585',
    accent: '#b45309',
    accentDim: '#92400e',
    accentGlow: 'rgba(180, 83, 9, 0.1)',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
  },
  dark: {
    bg: '#110f0b',
    surface: '#1a1710',
    surfaceHover: '#22201a',
    border: '#2e2a1e',
    borderActive: '#4a4230',
    text: '#ede8dc',
    textMuted: '#9a9080',
    textDim: '#665e4e',
    accent: '#d97706',
    accentDim: '#92400e',
    accentGlow: 'rgba(217, 119, 6, 0.14)',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
  },
};

const frost: ThemeDefinition = {
  name: 'frost',
  label: 'Frost',
  light: {
    bg: '#f5f7fa',
    surface: '#ffffff',
    surfaceHover: '#eef1f6',
    border: '#dde2ea',
    borderActive: '#b0bac8',
    text: '#1a2030',
    textMuted: '#5a6578',
    textDim: '#8a95a8',
    accent: '#6366f1',
    accentDim: '#4f46e5',
    accentGlow: 'rgba(99, 102, 241, 0.1)',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
  },
  dark: {
    bg: '#080810',
    surface: '#10101e',
    surfaceHover: '#18182a',
    border: '#20203a',
    borderActive: '#30305a',
    text: '#e0e0f0',
    textMuted: '#6868a0',
    textDim: '#404070',
    accent: '#818cf8',
    accentDim: '#6366f1',
    accentGlow: 'rgba(129, 140, 248, 0.12)',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
  },
};

/* ─── Registry ─── */
export const themes: Record<ThemeName, ThemeDefinition> = { slate, frost };

export const DEFAULT_PREFS: ThemePrefs = { theme: 'slate', mode: 'dark' };

/* ─── Helpers ─── */
/** Apply a resolved color set as CSS custom properties on an element. */
export function applyThemeColors(el: HTMLElement, colors: ThemeColors): void {
  const entries: [string, string][] = [
    ['--apex-bg', colors.bg],
    ['--apex-surface', colors.surface],
    ['--apex-surface-hover', colors.surfaceHover],
    ['--apex-border', colors.border],
    ['--apex-border-active', colors.borderActive],
    ['--apex-text', colors.text],
    ['--apex-text-muted', colors.textMuted],
    ['--apex-text-dim', colors.textDim],
    ['--apex-accent', colors.accent],
    ['--apex-accent-dim', colors.accentDim],
    ['--apex-accent-glow', colors.accentGlow],
    ['--apex-success', colors.success],
    ['--apex-warning', colors.warning],
    ['--apex-danger', colors.danger],
  ];
  for (const [prop, value] of entries) {
    el.style.setProperty(prop, value);
  }
}

/** Resolve which color variant to use given a mode and OS preference. */
export function resolveVariant(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}
