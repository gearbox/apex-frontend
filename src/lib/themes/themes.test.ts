import { describe, expect, it } from 'vitest';
import { themes, type ThemeColors } from './index';

describe('theme definitions', () => {
  it('uses the same ThemeColors keys for every light and dark variant', () => {
    const expected = Object.keys(themes.slate.light).sort();
    for (const theme of Object.values(themes)) {
      expect(Object.keys(theme.light).sort()).toEqual(expected);
      expect(Object.keys(theme.dark).sort()).toEqual(expected);
      const lightColors: ThemeColors = theme.light;
      const darkColors: ThemeColors = theme.dark;
      expect(Object.keys(lightColors).sort()).toEqual(expected);
      expect(Object.keys(darkColors).sort()).toEqual(expected);
    }
  });
});
