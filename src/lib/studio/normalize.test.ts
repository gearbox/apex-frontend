import { describe, expect, it } from 'vitest';
import { casefold, normalizeBlock, normalizeText } from './normalize';
import { samePlan } from './songDraft';

describe('studio document normalization', () => {
  it('collapses whitespace and NFC text without producing a phantom comparison', () => {
    expect(normalizeText('  Cafe\u0301  Noir\n  ')).toBe('Café Noir');
    expect(
      samePlan(
        { title: 'Café Noir', instrumental: false, references: [], sections: [] },
        { title: '  Cafe\u0301  Noir ', instrumental: false, references: [], sections: [] },
      ),
    ).toBe(true);
  });

  it('normalizes block line endings and keeps inner spacing', () => {
    expect(normalizeBlock('  First  line\r\nSecond\r\n  ')).toBe('First  line\nSecond');
    expect(normalizeBlock(' \n\t ')).toBeNull();
    expect(normalizeBlock(undefined)).toBeNull();
  });

  it('folds common casefold differences for duplicate tags', () => {
    expect(casefold('Straße')).toBe(casefold('STRASSE'));
    expect(casefold('ΟΣ')).toBe(casefold('οσ'));
  });
});
