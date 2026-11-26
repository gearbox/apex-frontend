import { expect, it } from 'vitest';
import { buildImportRequest, importIssueField, lineRange, sameImportRequest } from './sunoImport';

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

it.each([
  ['plan.global_style.avoid[0]', 'exclude'],
  ['artist.global_avoid[0]', 'exclude'],
  ['plan.global_style.tags[0]', 'style'],
  ['plan.tempo_bpm', 'style'],
  ['artist.style_tags[0]', 'style'],
  ['lyrics.sections[0].lines[1].text', 'lyrics'],
  ['plan.sections[0].lines[1].text', 'lyrics'],
  ['title', null],
])('places import issue path %s under exactly one destination', (path, field) => {
  expect(importIssueField(path)).toBe(field);
});
