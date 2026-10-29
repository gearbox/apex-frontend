import { describe, it, expect } from 'vitest';
import {
  REMOVED_IMAGE_MARKER,
  renumberAfterRemoval,
  outOfRangeImageTokens,
  outOfRangeR2vPromptViolation,
  removedReferenceViolation,
  insertPromptToken,
} from './r2vTokens';
describe('R2V tokens', () => {
  it.each([
    ['Image 10, Image 2', 1, 'Image 9, Image 1'],
    ['Image 1Image 2', 1, 'Image 1Image 2'],
    ['Image 1 waves at Image 2', 1, '[removed image] waves at Image 1'],
    ['image 2 Images 2', 1, 'image 2 Images 2'],
    ['Image 3', 3, '[removed image]'],
    ['A landscape', 2, 'A landscape'],
  ])('renumbers exact tokens: %s', (prompt, index, expected) =>
    expect(renumberAfterRemoval(prompt, index)).toEqual({ prompt: expected }),
  );
  it('marks every occurrence of a removed reference', () =>
    expect(renumberAfterRemoval('Image 2 meets Image 2', 2).prompt).toBe(
      '[removed image] meets [removed image]',
    ));
  it('marks the last source without changing earlier references', () =>
    expect(renumberAfterRemoval('Image 1 and Image 3', 3).prompt).toBe(
      'Image 1 and [removed image]',
    ));
  it('matches Image 1 exactly when removing it beside Image 10', () =>
    expect(renumberAfterRemoval('Image 10 beside Image 1', 1).prompt).toBe(
      'Image 9 beside [removed image]',
    ));
  it('finds missing and invalid references once each', () =>
    expect(outOfRangeImageTokens('Image 0 Image 3 Image 3 Image 2', 2)).toEqual([
      'Image 0',
      'Image 3',
    ]));
  it('reports the removed-image marker', () =>
    expect(removedReferenceViolation(`before ${REMOVED_IMAGE_MARKER} after`)).toContain(
      'removed image',
    ));
  it('accepts prompts without a removed-image marker in any generation mode', () =>
    expect(removedReferenceViolation('A landscape at sunset')).toBeNull());
  it.each([
    ['Image 1', 0],
    ['Image 3', 2],
  ])('blocks out-of-range prompt references: %s with %i sources', (prompt, count) =>
    expect(outOfRangeR2vPromptViolation(prompt, count)).not.toBeNull(),
  );
  it.each([
    ['Image 1 meets Image 2', 2],
    ['A landscape', 0],
  ])('accepts valid prompts without missing references: %s', (prompt, count) =>
    expect(outOfRangeR2vPromptViolation(prompt, count)).toBeNull(),
  );
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
