import * as m from '$paraglide/messages';

export const REMOVED_IMAGE_MARKER = '[removed image]';

export function renumberAfterRemoval(prompt: string, removedIndex1: number): { prompt: string } {
  const rewritten = prompt.replace(/\bImage (\d+)\b/g, (token, raw: string) => {
    const index = Number(raw);
    if (index === removedIndex1) return REMOVED_IMAGE_MARKER;
    return index > removedIndex1 ? `Image ${index - 1}` : token;
  });
  return { prompt: rewritten };
}
export function outOfRangeImageTokens(prompt: string, count: number): string[] {
  return [
    ...new Set(
      [...prompt.matchAll(/\bImage (\d+)\b/g)]
        .filter((match) => Number(match[1]) < 1 || Number(match[1]) > count)
        .map((match) => match[0]),
    ),
  ];
}

export function removedReferenceViolation(prompt: string): string | null {
  return prompt.includes(REMOVED_IMAGE_MARKER) ? m.r2v_removed_reference() : null;
}

export function outOfRangeR2vPromptViolation(prompt: string, count: number): string | null {
  if (outOfRangeImageTokens(prompt, count).length > 0) return m.r2v_missing_tokens();
  return null;
}

export function insertPromptToken(
  prompt: string,
  text: string,
  start: number,
  end: number,
  maxLength: number,
): { prompt: string; caret: number } | null {
  const before = prompt.slice(0, start).replace(/\s+$/, '');
  const after = prompt.slice(end).replace(/^\s+/, '');
  const prefix = before ? `${before} ` : '';
  const insertion = prefix + text + (after ? ' ' : '');
  const value = insertion + after;
  return value.length > maxLength ? null : { prompt: value, caret: insertion.length };
}
