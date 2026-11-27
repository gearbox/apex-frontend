import { normalizeText } from './normalize';
import type { LyricLine } from './songDraft';
export type LyricRowCode =
  | 'reserved_characters'
  | 'looks_like_header'
  | 'delivery_without_line'
  | 'delivery_twice'
  | 'empty_delivery'
  | 'delivery_too_many'
  | 'delivery_too_long'
  | 'line_too_long'
  | 'too_many_lines';

export interface LyricRowIssue {
  row: number;
  code: LyricRowCode;
  max?: number;
}

export interface ParsedSectionLyrics {
  lines: LyricLine[];
  rows: number[];
  issues: LyricRowIssue[];
}

/** Kept in sync with apex/src/studio/section_names.py ALIASES. */
export const SECTION_HEADER_ALIASES = [
  'intro',
  'verse',
  'pre chorus',
  'prechorus',
  'chorus',
  'refrain',
  'post chorus',
  'postchorus',
  'hook',
  'bridge',
  'build',
  'build up',
  'buildup',
  'drop',
  'breakdown',
  'break',
  'instrumental',
  'solo',
  'interlude',
  'outro',
  'end',
  'fade out',
] as const;

const HEADER_ALIAS_SET = new Set<string>(SECTION_HEADER_ALIASES);

/** Mirror section_names.py's _base_name, _key and is_header_text. */
export function looksLikeSectionHeader(bracketContent: string): boolean {
  const beforeColon = bracketContent.split(':', 1)[0] ?? '';
  const trimmed = beforeColon.trim();
  const withoutNumber = trimmed.replace(/\s+\p{Decimal_Number}{1,2}$/u, '');
  const key = withoutNumber
    .toLocaleLowerCase()
    .replace(/-/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ');
  return HEADER_ALIAS_SET.has(key);
}

export function parseSectionLyrics(text: string): ParsedSectionLyrics {
  const lines: LyricLine[] = [];
  const rows: number[] = [];
  const issues: LyricRowIssue[] = [];
  let pendingDelivery: string[] | null = null;
  let pendingDeliveryRow = -1;

  const addIssue = (row: number, code: LyricRowCode, max?: number) => {
    issues.push({ row, code, ...(max === undefined ? {} : { max }) });
  };

  text.split(/\r?\n/u).forEach((rawRow, row) => {
    const value = rawRow.trim();
    if (!value) return;

    const deliveryMatch = /^\[(.*)\]$/u.exec(value);
    if (deliveryMatch) {
      const inside = deliveryMatch[1] ?? '';
      if (looksLikeSectionHeader(inside)) {
        addIssue(row, 'looks_like_header');
        return;
      }
      if (pendingDelivery !== null) addIssue(row, 'delivery_twice');
      const items = inside.split(',').map(normalizeText);
      if (items.some((item) => !item)) addIssue(row, 'empty_delivery');
      const delivery = items.filter(Boolean);
      if (delivery.length > 6) addIssue(row, 'delivery_too_many', 6);
      for (const item of delivery) {
        if (Array.from(item).length > 40) addIssue(row, 'delivery_too_long', 40);
      }
      pendingDelivery = delivery;
      pendingDeliveryRow = row;
      return;
    }

    const normalized = normalizeText(value);
    if (normalized.includes('[') || normalized.includes(']')) addIssue(row, 'reserved_characters');
    if (Array.from(normalized).length > 300) addIssue(row, 'line_too_long', 300);
    lines.push({ text: normalized, delivery: pendingDelivery ?? [] });
    rows.push(row);
    pendingDelivery = null;
    pendingDeliveryRow = -1;
    if (lines.length === 65) addIssue(row, 'too_many_lines', 64);
  });

  if (pendingDelivery !== null) addIssue(pendingDeliveryRow, 'delivery_without_line');
  return { lines, rows, issues };
}

export function serializeSectionLyrics(lines: readonly LyricLine[]): string {
  return lines
    .flatMap((line) => [
      ...(line.delivery?.length ? [`[${line.delivery.join(', ')}]`] : []),
      line.text,
    ])
    .join('\n');
}
