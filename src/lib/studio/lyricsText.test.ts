import { describe, expect, it } from 'vitest';
import {
  looksLikeSectionHeader,
  parseSectionLyrics,
  SECTION_HEADER_ALIASES,
  serializeSectionLyrics,
} from './lyricsText';
import type { ParsedSectionLyrics } from './lyricsText';

describe('section lyrics text format', () => {
  it('serializes and parses normalized lines with deliveries', () => {
    const lines = [
      { text: 'Quiet now', delivery: ['whispered', 'close'] },
      { text: 'Hold the light', delivery: [] },
    ];
    const text = serializeSectionLyrics(lines);
    expect(text).toBe('[whispered, close]\nQuiet now\nHold the light');
    expect(parseSectionLyrics(text).lines).toEqual(lines);
  });

  it('skips blank rows and maps each lyric to its textarea row', () => {
    const parsed: ParsedSectionLyrics = parseSectionLyrics('[soft]\n\nOne\n\nTwo');
    expect(parsed.rows).toEqual([2, 4]);
    expect(parsed.lines).toEqual([
      { text: 'One', delivery: ['soft'] },
      { text: 'Two', delivery: [] },
    ]);
  });

  it.each([
    ['[Verse 2]', 'looks_like_header'],
    ['[a] text', 'reserved_characters'],
    ['[soft]', 'delivery_without_line'],
    ['[soft]\n[loud]\nline', 'delivery_twice'],
    ['[a, , b]\nline', 'empty_delivery'],
    [
      `[${Array.from({ length: 7 }, (_, index) => `tag${index}`).join(', ')}]\nline`,
      'delivery_too_many',
    ],
    [`[${'a'.repeat(41)}]\nline`, 'delivery_too_long'],
    [`${'x'.repeat(301)}`, 'line_too_long'],
    [Array.from({ length: 65 }, () => 'line').join('\n'), 'too_many_lines'],
  ] as const)('reports %s as %s', (text, code) => {
    expect(parseSectionLyrics(text).issues.map((item) => item.code)).toContain(code);
  });

  it.each(['Verse 2', 'Chorus: whispered', 'PRE-CHORUS 12', 'Refrain', 'Fade Out', 'End'])(
    'recognizes section header %s',
    (text) => expect(looksLikeSectionHeader(text)).toBe(true),
  );

  it.each(['whispered', 'Verse 123', 'Versed'])('does not treat %s as a header', (text) => {
    expect(looksLikeSectionHeader(text)).toBe(false);
  });

  it('header check is linear', () => {
    const row = `a${' '.repeat(100_000)}x`;
    const started = performance.now();
    expect(looksLikeSectionHeader(row)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('Verse 123 and Verse2 are not headers; PRE-CHORUS 12 is', () => {
    expect(looksLikeSectionHeader('Verse 123')).toBe(false);
    expect(looksLikeSectionHeader('Verse2')).toBe(false);
    expect(looksLikeSectionHeader('PRE-CHORUS 12')).toBe(true);
  });

  it('pins the complete backend alias set', () => {
    expect(SECTION_HEADER_ALIASES).toEqual([
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
    ]);
  });
});
