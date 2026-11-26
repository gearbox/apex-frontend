import { expect, it } from 'vitest';
import {
  buildImportRequest,
  importIssueField,
  importOutcome,
  lineRange,
  sameImportRequest,
  type SunoImportResult,
} from './sunoImport';

const version = (version_number: number) =>
  ({ version_number }) as SunoImportResult['plan_version'];
const lyricsDocument = { language: 'en', sections: [] } as SunoImportResult['lyrics'];
const importResult = (
  values: Partial<
    Pick<
      SunoImportResult,
      | 'plan_unchanged'
      | 'lyrics_unchanged'
      | 'plan_version'
      | 'lyrics_version'
      | 'lyrics'
      | 'created'
    >
  >,
) =>
  ({
    plan_unchanged: true,
    lyrics_unchanged: true,
    plan_version: null,
    lyrics_version: null,
    lyrics: null,
    created: false,
    ...values,
  }) as SunoImportResult;

it.each([
  { name: 'nothing changed', input: {}, expected: { kind: 'nothing' } },
  {
    name: 'plan changed',
    input: { plan_unchanged: false, plan_version: version(2) },
    expected: { kind: 'plan', plan: 2 },
  },
  {
    name: 'plan and lyrics changed',
    input: {
      plan_unchanged: false,
      lyrics_unchanged: false,
      plan_version: version(2),
      lyrics_version: version(3),
      lyrics: lyricsDocument,
    },
    expected: { kind: 'plan_and_lyrics', plan: 2, lyrics: 3 },
  },
  {
    name: 'plan changed and lyrics cleared',
    input: {
      plan_unchanged: false,
      lyrics_unchanged: false,
      plan_version: version(2),
      lyrics: null,
    },
    expected: { kind: 'plan_lyrics_cleared', plan: 2 },
  },
  {
    name: 'lyrics changed',
    input: {
      lyrics_unchanged: false,
      lyrics_version: version(3),
      lyrics: lyricsDocument,
    },
    expected: { kind: 'lyrics', lyrics: 3 },
  },
  {
    name: 'lyrics cleared without creating a version',
    input: {
      created: false,
      plan_unchanged: true,
      lyrics_unchanged: false,
      lyrics: null,
    },
    expected: { kind: 'lyrics_cleared' },
  },
])('classifies the import response when $name', ({ input, expected }) => {
  expect(importOutcome(importResult(input))).toEqual(expected);
});

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
