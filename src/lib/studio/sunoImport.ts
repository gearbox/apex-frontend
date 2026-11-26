import type { ImportRequest } from '$lib/queries/studioVersions';
import type { components } from '$lib/api/types';

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

const SUNO_SECTION_NAMES: Record<components['schemas']['StudioSectionKind'], string> = {
  intro: 'Intro',
  verse: 'Verse',
  pre_chorus: 'Pre-Chorus',
  chorus: 'Chorus',
  post_chorus: 'Post-Chorus',
  hook: 'Hook',
  bridge: 'Bridge',
  build: 'Build',
  drop: 'Drop',
  breakdown: 'Breakdown',
  instrumental: 'Instrumental',
  interlude: 'Interlude',
  outro: 'Outro',
};
const NO_NUMBER = new Set(['chorus', 'pre_chorus', 'post_chorus', 'hook']);

/** Render the normalized dry-run documents into their canonical Suno Lyrics box. */
export function normalizedSunoLyrics(
  plan: components['schemas']['PlanDocument'],
  lyrics: components['schemas']['LyricsDocument'] | null,
): string {
  const sections = (plan.sections ?? []) as components['schemas']['PlanSection'][];
  const lyricSections = (lyrics?.sections ?? []) as components['schemas']['LyricsSection'][];
  type LyricLine = components['schemas']['LyricLine'];
  const counts = new Map<string, number>();
  for (const section of sections) counts.set(section.kind, (counts.get(section.kind) ?? 0) + 1);
  return sections
    .map((section) => {
      const repeated = (counts.get(section.kind) ?? 0) > 1 && !NO_NUMBER.has(section.kind);
      const index = sections
        .filter((item) => item.kind === section.kind)
        .findIndex((item) => item.id === section.id);
      const label =
        section.label ?? `${SUNO_SECTION_NAMES[section.kind]}${repeated ? ` ${index + 1}` : ''}`;
      const delivery = (section.delivery ?? []) as string[];
      const styleTags = (section.style?.tags ?? []) as string[];
      const descriptors = [
        ...(section.instrumental && section.kind !== 'instrumental' ? ['instrumental'] : []),
        ...delivery,
        ...styleTags,
      ].filter(
        (tag, tagIndex, all) =>
          all.findIndex((value) => value.toLowerCase() === tag.toLowerCase()) === tagIndex,
      );
      const header = `[${label}${descriptors.length ? `: ${descriptors.join(', ')}` : ''}]`;
      const lines = (lyricSections.find((entry) => entry.section_id === section.id)?.lines ??
        []) as LyricLine[];
      const body = lines.flatMap((line) => [
        ...((line.delivery as string[] | undefined)?.length
          ? [`[${(line.delivery as string[]).join(', ')}]`]
          : []),
        line.text,
      ]);
      return [header, ...body].join('\n');
    })
    .join('\n\n');
}
