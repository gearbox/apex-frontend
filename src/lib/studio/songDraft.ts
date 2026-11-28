import type { components } from '$lib/api/types';
import { normalizeBlock, normalizeText } from './normalize';
import { parseSectionLyrics, serializeSectionLyrics, type LyricRowIssue } from './lyricsText';
import { codePointLength } from './text';

export type SectionKind = components['schemas']['StudioSectionKind'];
export type Pair = { plan: string | null; lyrics: string | null };
export type DocumentPair = { plan: PlanDocument | null; lyrics: LyricsDocument | null };

export interface StyleSpec {
  tags: string[];
  avoid: string[];
}

export interface PlanSection {
  id: string;
  kind: SectionKind;
  label?: string | null;
  duration_seconds?: number | null;
  style?: StyleSpec;
  delivery: string[];
  instrumental: boolean;
  notes?: string | null;
}

export interface PlanDocument {
  title: string;
  idea?: string | null;
  tempo_bpm?: number | null;
  instrumental: boolean;
  global_style?: StyleSpec;
  references: string[];
  sections: PlanSection[];
}

export interface LyricsDocument {
  language: string;
  line_syllables?: { min: number; max: number } | null;
  sections: Array<{ section_id: string; lines: LyricLine[] }>;
}

export interface LyricLine {
  text: string;
  delivery: string[];
}

export interface SectionDraft {
  id: string;
  kind: SectionKind;
  label: string;
  delivery: string[];
  styleTags: string[];
  styleAvoid: string[];
  instrumental: boolean;
  duration: string;
  notes: string;
  lyrics: string;
}

export interface SongDraft {
  title: string;
  idea: string;
  tempo: string;
  instrumental: boolean;
  styleTags: string[];
  styleAvoid: string[];
  references: string[];
  language: string;
  lineSyllables: { min: number; max: number } | null;
  sections: SectionDraft[];
}

export interface BuiltSong {
  plan: PlanDocument;
  lyrics: LyricsDocument | null;
  rows: ReadonlyMap<string, number[]>;
  lyricsSectionIds: string[];
  hiddenLines: ReadonlyMap<string, number>;
  rowIssues: ReadonlyMap<string, LyricRowIssue[]>;
}

function emptySection(id: string, kind: SectionKind): SectionDraft {
  return {
    id,
    kind,
    label: '',
    delivery: [],
    styleTags: [],
    styleAvoid: [],
    instrumental: false,
    duration: '',
    notes: '',
    lyrics: '',
  };
}

export function draftFromDocuments(
  plan: PlanDocument,
  lyrics: LyricsDocument | null,
  defaults: { language: string },
): SongDraft {
  const lyricsBySection = new Map(
    (lyrics?.sections ?? []).map((section) => [section.section_id, section.lines]),
  );
  return {
    title: plan.title,
    idea: plan.idea ?? '',
    tempo: plan.tempo_bpm == null ? '' : String(plan.tempo_bpm),
    instrumental: plan.instrumental ?? false,
    styleTags: [...(plan.global_style?.tags ?? [])],
    styleAvoid: [...(plan.global_style?.avoid ?? [])],
    references: [...(plan.references ?? [])],
    language: lyrics?.language ?? defaults.language,
    lineSyllables: lyrics?.line_syllables ?? null,
    sections: (plan.sections ?? []).map((section) => ({
      id: section.id,
      kind: section.kind,
      label: section.label ?? '',
      delivery: [...(section.delivery ?? [])],
      styleTags: [...(section.style?.tags ?? [])],
      styleAvoid: [...(section.style?.avoid ?? [])],
      instrumental: section.instrumental ?? false,
      duration: section.duration_seconds == null ? '' : String(section.duration_seconds),
      notes: section.notes ?? '',
      lyrics: serializeSectionLyrics(lyricsBySection.get(section.id) ?? []),
    })),
  };
}

export function newDraft(
  template: 'blank' | 'verse_chorus',
  title: string,
  language: string,
  makeId: () => string,
): SongDraft {
  const draft: SongDraft = {
    title,
    idea: '',
    tempo: '',
    instrumental: false,
    styleTags: [],
    styleAvoid: [],
    references: [],
    language,
    lineSyllables: null,
    sections: [],
  };
  if (template === 'verse_chorus') {
    draft.sections = ['verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'].map((kind) =>
      emptySection(makeId(), kind as SectionKind),
    );
  }
  return draft;
}

/** Whether a section's lyrics are left out of the documents. */
export function isHiddenSection(
  draft: Pick<SongDraft, 'instrumental'>,
  item: Pick<SectionDraft, 'kind' | 'instrumental'>,
): boolean {
  return draft.instrumental || item.instrumental || item.kind === 'instrumental';
}

/** Text on screen that the documents do not carry: hidden (instrumental) lyrics, or rows the parser
 *  could not represent. Such a draft must stay on the device even when the documents equal the base. */
export function hasUnsentInput(draft: SongDraft, built: BuiltSong): boolean {
  return draft.sections.some(
    (section) =>
      (isHiddenSection(draft, section) && section.lyrics.trim() !== '') ||
      (built.rowIssues.get(section.id)?.length ?? 0) > 0,
  );
}

export function buildSong(draft: SongDraft): BuiltSong {
  const sections: PlanSection[] = draft.sections.map((section) => {
    const duration = section.duration.trim();
    return {
      id: section.id,
      kind: section.kind,
      label: normalizeText(section.label) || null,
      duration_seconds: duration ? Number(duration) : null,
      style: {
        tags: section.styleTags.map(normalizeText),
        avoid: section.styleAvoid.map(normalizeText),
      },
      delivery: section.delivery.map(normalizeText),
      instrumental: section.instrumental,
      notes: normalizeBlock(section.notes),
    };
  });
  const plan: PlanDocument = {
    title: normalizeText(draft.title),
    idea: normalizeBlock(draft.idea),
    tempo_bpm: draft.tempo.trim() ? Number(draft.tempo.trim()) : null,
    instrumental: draft.instrumental,
    global_style: {
      tags: draft.styleTags.map(normalizeText),
      avoid: draft.styleAvoid.map(normalizeText),
    },
    references: draft.references.map(normalizeText),
    sections,
  };

  const rows = new Map<string, number[]>();
  const rowIssues = new Map<string, LyricRowIssue[]>();
  const hiddenLines = new Map<string, number>();
  const lyricSections: LyricsDocument['sections'] = [];
  const lyricsSectionIds: string[] = [];
  for (const section of draft.sections) {
    const parsed = parseSectionLyrics(section.lyrics);
    rowIssues.set(section.id, parsed.issues);
    if (isHiddenSection(draft, section)) {
      // Rows that form no lyric line, such as a lone delivery row, are hidden text too.
      const count =
        parsed.lines.length || section.lyrics.split(/\r?\n/u).filter((row) => row.trim()).length;
      if (count) hiddenLines.set(section.id, count);
      continue;
    }
    if (!parsed.lines.length) continue;
    lyricSections.push({ section_id: section.id, lines: parsed.lines });
    lyricsSectionIds.push(section.id);
    rows.set(section.id, parsed.rows);
  }
  const lyrics: LyricsDocument | null = lyricSections.length
    ? {
        language: normalizeText(draft.language),
        line_syllables: draft.lineSyllables,
        sections: lyricSections,
      }
    : null;

  return { plan, lyrics, rows, lyricsSectionIds, hiddenLines, rowIssues };
}

function canonicalStyle(style?: StyleSpec | null) {
  return {
    tags: (style?.tags ?? []).map(normalizeText),
    avoid: (style?.avoid ?? []).map(normalizeText),
  };
}

function canonicalPlan(plan: PlanDocument | null) {
  if (!plan) return null;
  return {
    title: normalizeText(plan.title),
    idea: normalizeBlock(plan.idea),
    tempo_bpm: plan.tempo_bpm ?? null,
    instrumental: plan.instrumental ?? false,
    global_style: canonicalStyle(plan.global_style),
    references: (plan.references ?? []).map(normalizeText),
    sections: (plan.sections ?? []).map((section) => ({
      id: section.id,
      kind: section.kind,
      label: section.label == null ? null : normalizeText(section.label) || null,
      duration_seconds: section.duration_seconds ?? null,
      style: canonicalStyle(section.style),
      delivery: (section.delivery ?? []).map(normalizeText),
      instrumental: section.instrumental ?? false,
      notes: normalizeBlock(section.notes),
    })),
  };
}

function canonicalLyrics(lyrics: LyricsDocument | null) {
  if (!lyrics) return null;
  return {
    language: lyrics.language,
    line_syllables: lyrics.line_syllables ?? null,
    sections: (lyrics.sections ?? []).map((section) => ({
      section_id: section.section_id,
      lines: section.lines.map((line) => ({
        text: normalizeText(line.text),
        delivery: (line.delivery ?? []).map(normalizeText),
      })),
    })),
  };
}

export function samePlan(a: PlanDocument | null, b: PlanDocument | null): boolean {
  return JSON.stringify(canonicalPlan(a)) === JSON.stringify(canonicalPlan(b));
}

export function sameLyrics(a: LyricsDocument | null, b: LyricsDocument | null): boolean {
  return JSON.stringify(canonicalLyrics(a)) === JSON.stringify(canonicalLyrics(b));
}

export function sameDocs(a: DocumentPair, b: DocumentPair): boolean {
  return samePlan(a.plan, b.plan) && sameLyrics(a.lyrics, b.lyrics);
}

/** The characters of all lyric lines, which the whole-song limit counts. */
export function lyricsLength(lyrics: LyricsDocument | null): number {
  return (lyrics?.sections ?? [])
    .flatMap((section) => section.lines)
    .reduce((sum, line) => sum + codePointLength(line.text), 0);
}
