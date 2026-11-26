import { expect, it } from 'vitest';
import { sectionDisplayName, sunoSectionName } from './sections';
import type { components } from '$lib/api/types';

type Section = components['schemas']['PlanSection'];
const section = (id: string, kind: Section['kind'], label?: string | null): Section => ({
  id,
  kind,
  delivery: [],
  instrumental: false,
  ...(label !== undefined ? { label } : {}),
});

it('numbers repeated verses and leaves a single verse unnumbered', () => {
  const verse1 = section('v1', 'verse');
  const verse2 = section('v2', 'verse');
  expect(sectionDisplayName(verse1, [verse1, verse2])).toBe('Verse 1');
  expect(sectionDisplayName(verse2, [verse1, verse2])).toBe('Verse 2');
  expect(sectionDisplayName(verse1, [verse1])).toBe('Verse');
});

it('does not number repeated choruses, prefers labels and localizes section kinds', () => {
  const chorus1 = section('c1', 'chorus');
  const chorus2 = section('c2', 'chorus');
  expect(sectionDisplayName(chorus1, [chorus1, chorus2])).toBe('Chorus');
  expect(
    sectionDisplayName(section('custom', 'verse', 'The Return'), [
      section('custom', 'verse', 'The Return'),
    ]),
  ).toBe('The Return');
  expect(sectionDisplayName(section('pre', 'pre_chorus'), [section('pre', 'pre_chorus')])).toBe(
    'Pre-Chorus',
  );
});

it('uses one numbering rule with localized and Suno section name tables', () => {
  const verse1 = section('v1', 'verse');
  const verse2 = section('v2', 'verse');
  expect(sectionDisplayName(verse2, [verse1, verse2])).toBe('Verse 2');
  expect(sunoSectionName(verse2, [verse1, verse2])).toBe('Verse 2');
  expect(sunoSectionName(section('custom', 'verse', 'The Return'), [])).toBe('The Return');
  const chorus1 = section('c1', 'chorus');
  const chorus2 = section('c2', 'chorus');
  expect(sunoSectionName(chorus2, [chorus1, chorus2])).toBe('Chorus');
});
