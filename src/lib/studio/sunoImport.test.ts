import { expect, it } from 'vitest';
import {
  buildImportRequest,
  lineRange,
  normalizedSunoLyrics,
  sameImportRequest,
} from './sunoImport';

it('builds an exact, non-normalized preview request and compares each field', () => {
  const request = buildImportRequest({
    style: ' rock,  dream pop ',
    exclude: '',
    lyrics: 'First line\r\nSecond line',
    title: '',
    instrumental: 'keep',
    language: '',
  });
  expect(request).toEqual({
    style: ' rock,  dream pop ',
    exclude: '',
    lyrics: 'First line\r\nSecond line',
    title: null,
    instrumental: null,
    language: null,
  });
  expect(sameImportRequest(request, { ...request })).toBe(true);
  expect(sameImportRequest(request, { ...request, style: request.style + '!' })).toBe(false);
});

it.each([
  ['a\nb\nc', 1, { start: 0, end: 1 }],
  ['a\r\nb\rc', 2, { start: 3, end: 4 }],
  ['a\r\nb\rc', 3, { start: 5, end: 6 }],
  ['a\nb', 3, null],
])('selects line %s in pasted text', (text, line, expected) => {
  expect(lineRange(text, line)).toEqual(expected);
});

it('renders normalized lyrics under their plan section IDs', () => {
  expect(
    normalizedSunoLyrics(
      {
        title: 'Song',
        instrumental: false,
        references: [],
        sections: [
          {
            id: 'v',
            kind: 'verse',
            delivery: ['soft'],
            instrumental: false,
            style: { tags: ['warm'] },
          },
        ],
      },
      {
        language: 'en',
        sections: [{ section_id: 'v', lines: [{ text: 'Line', delivery: ['breathy'] }] }],
      },
    ),
  ).toBe('[Verse: soft, warm]\n[breathy]\nLine');
});
