import { describe, expect, it } from 'vitest';
import { codePointLength } from './text';

describe('codePointLength', () => {
  it('counts emoji as one code point each', () => {
    expect(codePointLength('🙂🎵')).toBe(2);
  });

  it('normalizes combining sequences before counting', () => {
    expect(codePointLength('e\u0301')).toBe(1);
    expect(codePointLength('e\u0301 and 🙂')).toBe(7);
  });

  it('counts already normalized text by code point', () => {
    expect(codePointLength('é🙂')).toBe(2);
  });
});
