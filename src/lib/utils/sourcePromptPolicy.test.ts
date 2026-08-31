import { describe, expect, it } from 'vitest';
import { shouldCopySourcePrompt } from './sourcePromptPolicy';

describe('source prompt policy', () => {
  it('only copies provenance for the first source in an empty prompt draft', () => {
    expect(shouldCopySourcePrompt(0, '')).toBe(true);
    expect(shouldCopySourcePrompt(0, 'My own prompt')).toBe(false);
    expect(shouldCopySourcePrompt(1, '')).toBe(false);
  });
});
