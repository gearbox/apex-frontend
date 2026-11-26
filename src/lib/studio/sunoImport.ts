import type { ImportRequest } from '$lib/queries/studioVersions';

export interface SunoImportForm {
  style: string;
  exclude: string;
  lyrics: string;
  title: string;
  instrumental: 'keep' | 'on' | 'off';
  language: string;
}

/** Build the immutable request snapshot used for both preview and import. */
export function buildImportRequest(form: SunoImportForm): ImportRequest {
  return {
    style: form.style,
    exclude: form.exclude,
    lyrics: form.lyrics,
    title: form.title === '' ? null : form.title,
    instrumental: form.instrumental === 'keep' ? null : form.instrumental === 'on',
    language: form.language === '' ? null : form.language,
  };
}

/** Compare every request field explicitly so a preview cannot be reused for edited data. */
export function sameImportRequest(left: ImportRequest, right: ImportRequest): boolean {
  return (
    left.title === right.title &&
    left.style === right.style &&
    left.exclude === right.exclude &&
    left.lyrics === right.lyrics &&
    left.instrumental === right.instrumental &&
    left.language === right.language
  );
}

interface TextRange {
  start: number;
  end: number;
}

/** Return the selectable character offsets for a 1-based line, handling LF, CRLF and CR. */
export function lineRange(text: string, lineNumber: number): TextRange | null {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return null;
  let line = 1;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char !== '\r' && char !== '\n') continue;
    if (line === lineNumber) return { start, end: index };
    if (char === '\r' && text[index + 1] === '\n') index++;
    line++;
    start = index + 1;
  }
  return line === lineNumber ? { start, end: text.length } : null;
}

/** Place a structured import issue in exactly one field or in the general issue list. */
export function importIssueField(path: string): 'style' | 'exclude' | 'lyrics' | null {
  const normalized = path.toLowerCase();
  if (
    normalized.includes('global_style.avoid') ||
    normalized.includes('artist.global_avoid') ||
    normalized.includes('exclude')
  )
    return 'exclude';
  if (
    normalized.includes('global_style.tags') ||
    normalized.includes('tempo_bpm') ||
    normalized.includes('artist.style_tags')
  )
    return 'style';
  if (normalized.startsWith('lyrics') || normalized.includes('plan.sections')) return 'lyrics';
  return null;
}
