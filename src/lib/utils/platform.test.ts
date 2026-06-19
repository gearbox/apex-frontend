import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('platform utilities', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('isStandalone', () => {
    it('returns false when not in standalone mode', async () => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn().mockReturnValue({ matches: false }),
      });

      const { isStandalone } = await import('./platform');
      expect(isStandalone()).toBe(false);
    });

    it('returns true when display-mode is standalone', async () => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === '(display-mode: standalone)',
        })),
      });

      const { isStandalone } = await import('./platform');
      expect(isStandalone()).toBe(true);
    });
  });
});
