import { describe, expect, it } from 'vitest';
import { createAppVersionManifest } from '../../../build-version-manifest.js';

describe('createAppVersionManifest', () => {
  it('uses the supplied build metadata without adding unchecked fields', () => {
    expect(
      createAppVersionManifest({
        version: '0.13.2',
        buildSha: 'abc1234',
        builtAt: '2026-07-18T10:20:00.000Z',
      }),
    ).toEqual({
      version: '0.13.2',
      buildSha: 'abc1234',
      builtAt: '2026-07-18T10:20:00.000Z',
    });
  });
});
