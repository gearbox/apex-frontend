import { describe, expect, it } from 'vitest';
import { defaultModelGuideSource } from './source';

describe('defaultModelGuideSource', () => {
  it('resolves a known model key', () => {
    expect(defaultModelGuideSource.get('grok-imagine-image')?.modelKey).toBe('grok-imagine-image');
  });

  it('safely ignores an unknown future-looking backend key', () => {
    expect(defaultModelGuideSource.get('future-provider-image-v9')).toBeNull();
  });
});
