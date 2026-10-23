import { describe, it, expect } from 'vitest';
import { renumberAfterRemoval, outOfRangeImageTokens, insertPromptToken } from './r2vTokens';
describe('R2V tokens', () => {
  it.each([
    ['Image 10, Image 2', 1, 'Image 9, Image 1', false],
    ['Image 1Image 2', 1, 'Image 1Image 2', false],
    ['Image 1 Image 2', 1, 'Image 1 Image 1', true],
    ['image 2 Images 2', 1, 'image 2 Images 2', false],
    ['Image 3', 3, 'Image 3', true],
    ['A landscape', 2, 'A landscape', false],
  ])('renumbers exact tokens: %s', (prompt, index, expected, orphaned) =>
    expect(renumberAfterRemoval(prompt, index)).toEqual({ prompt: expected, orphaned }),
  );
  it('finds missing and invalid references once each', () =>
    expect(outOfRangeImageTokens('Image 0 Image 3 Image 3 Image 2', 2)).toEqual([
      'Image 0',
      'Image 3',
    ]));
  it.each([
    [0, 'Image 2 hello world'],
    [6, 'hello Image 2 world'],
    [11, 'hello world Image 2'],
  ])('inserts at %s', (start, expected) =>
    expect(insertPromptToken('hello world', 'Image 2', start, start, 100)?.prompt).toBe(expected),
  );
  it('replaces selected text and normalizes adjacent whitespace', () =>
    expect(insertPromptToken('hello  old  world', 'Image 1', 7, 10, 100)?.prompt).toBe(
      'hello Image 1 world',
    ));
  it('refuses an insertion beyond max length', () =>
    expect(insertPromptToken('full', 'Image 1', 4, 4, 4)).toBeNull());
});
