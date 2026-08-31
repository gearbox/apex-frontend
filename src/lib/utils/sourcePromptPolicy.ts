/**
 * Generic picker selections may inherit provenance only for a completely
 * blank draft's first source. Secondary references never rewrite user text.
 */
export function shouldCopySourcePrompt(existingSourceCount: number, prompt: string): boolean {
  return existingSourceCount === 0 && prompt.trim().length === 0;
}
