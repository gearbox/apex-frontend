import { describe, it, expect } from 'vitest';
import { APP_VERSION, BUILD_SHA, APP_VERSION_LABEL } from './appVersion';

describe('appVersion', () => {
  it('exposes a non-empty semantic version', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exposes a build sha (or "dev" locally)', () => {
    expect(BUILD_SHA.length).toBeGreaterThan(0);
  });

  it('composes the label as "v<version> · <sha>"', () => {
    expect(APP_VERSION_LABEL).toBe(`v${APP_VERSION} · ${BUILD_SHA}`);
    expect(APP_VERSION_LABEL).toMatch(/^v\d+\.\d+\.\d+ · \S+$/);
  });
});
