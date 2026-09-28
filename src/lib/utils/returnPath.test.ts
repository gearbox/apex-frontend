import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './returnPath';

describe('safeReturnPath', () => {
  it('accepts same-origin paths up to the API limit', () => {
    expect(safeReturnPath('/')).toBe('/');
    expect(safeReturnPath('/app/gallery?x=1')).toBe('/app/gallery?x=1');
    expect(safeReturnPath(`/${'a'.repeat(511)}`)).toHaveLength(512);
  });

  it.each(['//evil', '/\\evil', 'https://x', 'javascript:x', '/a b', '/a#fragment', '', 'x'])(
    'rejects %s',
    (value) => {
      expect(safeReturnPath(value)).toBeNull();
    },
  );

  it('rejects values that are absent or too long', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(`/${'a'.repeat(512)}`)).toBeNull();
  });
});
