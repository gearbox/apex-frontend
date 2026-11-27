/** NFC, trim, collapse internal whitespace (including line breaks) to one space. */
export function normalizeText(value: string): string {
  return value.normalize('NFC').split(/\s+/u).filter(Boolean).join(' ');
}

/** NFC, normalize line endings and trim; blank blocks become null. */
export function normalizeBlock(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.normalize('NFC').replace(/\r\n?/gu, '\n').trim();
  return normalized || null;
}

/** Python's str.casefold for the common special cases used in user supplied tags. */
export function casefold(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/ß/gu, 'ss').replace(/ς/gu, 'σ');
}
