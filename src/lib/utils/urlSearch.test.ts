import { describe, expect, it } from 'vitest';
import { withoutSearchParam } from './urlSearch';

describe('withoutSearchParam()', () => {
  it('removes every matching value on a copy and preserves unrelated query state', () => {
    const original = new URL('https://example.test/reset?token=secret&source=mail&token=again');

    const result = withoutSearchParam(original, 'token');

    expect(result).not.toBe(original);
    expect(result.searchParams.has('token')).toBe(false);
    expect(result.searchParams.get('source')).toBe('mail');
    expect(original.searchParams.getAll('token')).toEqual(['secret', 'again']);
  });
});
