import { describe, expect, it } from 'vitest';
import { artistMonogram } from './artists';

describe('artistMonogram', () => {
  it('uses the first code point from up to two words and normalizes spacing/case', () => {
    expect(artistMonogram('  iris   vale  ')).toBe('IV');
    expect(artistMonogram('single')).toBe('S');
    expect(artistMonogram('🌊 singer')).toBe('🌊S');
  });
});
