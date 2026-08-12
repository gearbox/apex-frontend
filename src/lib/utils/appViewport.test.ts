import { describe, expect, it } from 'vitest';
import { resolveAppViewportHeight } from './appViewport';

describe('resolveAppViewportHeight', () => {
  it('keeps Android standalone constrained to the visible viewport', () => {
    expect(
      resolveAppViewportHeight({
        visualViewportHeight: 780,
        innerHeight: 780,
        screenWidth: 412,
        screenHeight: 915,
        portrait: true,
        standalone: true,
        platform: 'chromium',
      }),
    ).toBe(780);
  });

  it('preserves the iOS standalone screen-height floor', () => {
    expect(
      resolveAppViewportHeight({
        visualViewportHeight: 894,
        innerHeight: 894,
        screenWidth: 440,
        screenHeight: 956,
        portrait: true,
        standalone: true,
        platform: 'ios',
      }),
    ).toBe(956);
  });

  it('uses the landscape screen height as the iOS standalone floor', () => {
    expect(
      resolveAppViewportHeight({
        visualViewportHeight: 380,
        innerHeight: 380,
        screenWidth: 956,
        screenHeight: 440,
        portrait: false,
        standalone: true,
        platform: 'ios',
      }),
    ).toBe(440);
  });

  it('uses the visible viewport for iOS outside standalone mode', () => {
    expect(
      resolveAppViewportHeight({
        visualViewportHeight: 820,
        innerHeight: 820,
        screenWidth: 440,
        screenHeight: 956,
        portrait: true,
        standalone: false,
        platform: 'ios',
      }),
    ).toBe(820);
  });

  it('falls back to innerHeight when visualViewport is unavailable', () => {
    expect(
      resolveAppViewportHeight({
        innerHeight: 760,
        screenWidth: 412,
        screenHeight: 915,
        portrait: true,
        standalone: true,
        platform: 'chromium',
      }),
    ).toBe(760);
  });
});
