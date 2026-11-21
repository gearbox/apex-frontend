import { describe, expect, it } from 'vitest';
import { parseProductId } from './ids';
describe('parseProductId', () => {
  it('accepts known trimmed IDs and rejects unknown or empty values', () => {
    expect(parseProductId('vex')).toBe('vex');
    expect(parseProductId(' synthara ')).toBe('synthara');
    for (const value of ['', 'Vex', 'acme', null, undefined])
      expect(parseProductId(value)).toBeNull();
  });
});
