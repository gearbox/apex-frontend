import { STUDIO_LIMITS } from './limits';
import { casefold, normalizeText } from './normalize';
import { isLanguageTag } from './language';
import { codePointLength } from './text';
import type { BuiltSong, SongDraft } from './songDraft';

export type DraftTarget =
  | { kind: 'song'; field: string }
  | { kind: 'section'; id: string; field: string }
  | { kind: 'lyrics'; id: string; row: number };

export interface DraftIssue {
  target: DraftTarget | null;
  code: string;
  max?: number;
  path?: string;
}

function issue(
  target: DraftTarget | null,
  code: string,
  options: { max?: number; path?: string } = {},
): DraftIssue {
  return { target, code, ...options };
}

function checkList(
  values: readonly string[],
  target: DraftTarget,
  path: string,
  maxItems: number,
  maxLength: number,
  options: { reserved?: boolean; duplicate?: boolean } = {},
): DraftIssue[] {
  const result: DraftIssue[] = [];
  if (values.length > maxItems)
    result.push(issue(target, 'too_many_items', { max: maxItems, path }));
  const seen = new Set<string>();
  values.forEach((raw, index) => {
    const value = normalizeText(raw);
    const itemTarget = target.kind === 'section' ? target : target;
    const itemPath = `${path}[${index}]`;
    if (!value) result.push(issue(itemTarget, 'empty_after_normalization', { path: itemPath }));
    else if (codePointLength(value) > maxLength) {
      result.push(
        issue(itemTarget, 'too_long_after_normalization', { max: maxLength, path: itemPath }),
      );
    }
    if ((options.reserved ?? true) && (value.includes('[') || value.includes(']'))) {
      result.push(issue(itemTarget, 'reserved_characters', { path: itemPath }));
    }
    if (options.duplicate !== false && value) {
      const key = casefold(value);
      if (seen.has(key)) result.push(issue(itemTarget, 'duplicate_tag', { path: itemPath }));
      seen.add(key);
    }
  });
  return result;
}

function checkStylePair(
  tags: string[],
  avoid: string[],
  target: DraftTarget,
  path: string,
  maxItems: number,
  maxLength: number,
): DraftIssue[] {
  const result = [
    ...checkList(tags, target, `${path}.tags`, maxItems, maxLength),
    ...checkList(avoid, target, `${path}.avoid`, maxItems, maxLength),
  ];
  const wanted = new Set(tags.map((tag) => casefold(normalizeText(tag))).filter(Boolean));
  avoid.forEach((tag, index) => {
    if (wanted.has(casefold(normalizeText(tag)))) {
      result.push(issue(target, 'tag_conflict', { path: `${path}.avoid[${index}]` }));
    }
  });
  return result;
}

function numericIssue(value: string, min: number, max: number, target: DraftTarget, path: string) {
  const clean = value.trim();
  if (!clean) return null;
  const number = Number(clean);
  return Number.isInteger(number) && number >= min && number <= max
    ? null
    : issue(target, 'out_of_range', { max, path });
}

function checkTextLength(
  value: string,
  max: number,
  target: DraftTarget,
  path: string,
  emptyAllowed = true,
): DraftIssue[] {
  const normalized = normalizeText(value);
  if (!normalized)
    return emptyAllowed ? [] : [issue(target, 'empty_after_normalization', { path })];
  return codePointLength(normalized) > max
    ? [issue(target, 'too_long_after_normalization', { max, path })]
    : [];
}

export function validateSong(draft: SongDraft, built: BuiltSong): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const song = (field: string): DraftTarget => ({ kind: 'song', field });
  const title = normalizeText(draft.title);
  if (!title) issues.push(issue(song('title'), 'empty_after_normalization', { path: 'title' }));
  else if (codePointLength(title) > 200)
    issues.push(issue(song('title'), 'too_long_after_normalization', { max: 200, path: 'title' }));
  const tempoIssue = numericIssue(draft.tempo, 40, 240, song('tempo'), 'tempo_bpm');
  if (tempoIssue) issues.push(tempoIssue);
  if (draft.sections.length > 64)
    issues.push(issue(song('sections'), 'too_many_items', { max: 64, path: 'sections' }));

  issues.push(
    ...checkStylePair(
      draft.styleTags,
      draft.styleAvoid,
      song('styleTags'),
      'global_style',
      STUDIO_LIMITS.styleTags.items,
      STUDIO_LIMITS.styleTags.length,
    ),
    ...checkList(
      draft.references,
      song('references'),
      'references',
      STUDIO_LIMITS.aestheticReferences.items,
      STUDIO_LIMITS.aestheticReferences.length,
      { reserved: false, duplicate: false },
    ),
    ...checkTextLength(draft.idea, 4000, song('idea'), 'idea'),
  );
  draft.styleTags.forEach((tag, index) => {
    if (/^(\d{2,3})\s?bpm$/iu.test(normalizeText(tag))) {
      const value = Number(normalizeText(tag).match(/\d+/u)?.[0]);
      if (value >= 40 && value <= 240)
        issues.push(
          issue(song('styleTags'), 'reserved_tempo_tag', { path: `global_style.tags[${index}]` }),
        );
    }
  });

  let totalDuration = 0;
  let totalLyricsLength = 0;
  const seenIds = new Set<string>();
  for (let index = 0; index < draft.sections.length; index++) {
    const section = draft.sections[index]!;
    const target: DraftTarget = { kind: 'section', id: section.id, field: 'kind' };
    const path = `sections[${index}]`;
    if (seenIds.has(section.id))
      issues.push(issue(target, 'duplicate_section_id', { path: `${path}.id` }));
    seenIds.add(section.id);
    const label = normalizeText(section.label);
    if (label && codePointLength(label) > 60)
      issues.push(
        issue({ kind: 'section', id: section.id, field: 'label' }, 'too_long_after_normalization', {
          max: 60,
          path: `${path}.label`,
        }),
      );
    if (label.includes('[') || label.includes(']'))
      issues.push(
        issue({ kind: 'section', id: section.id, field: 'label' }, 'reserved_characters', {
          path: `${path}.label`,
        }),
      );

    issues.push(
      ...checkList(
        section.delivery,
        { kind: 'section', id: section.id, field: 'delivery' },
        `${path}.delivery`,
        12,
        40,
      ),
      ...checkStylePair(
        section.styleTags,
        section.styleAvoid,
        { kind: 'section', id: section.id, field: 'styleTags' },
        `${path}.style`,
        STUDIO_LIMITS.styleTags.items,
        STUDIO_LIMITS.styleTags.length,
      ),
      ...checkTextLength(
        section.notes,
        1000,
        { kind: 'section', id: section.id, field: 'notes' },
        `${path}.notes`,
      ),
    );
    for (const [list, field, listPath] of [
      [section.delivery, 'delivery', `${path}.delivery`],
      [section.styleTags, 'styleTags', `${path}.style.tags`],
    ] as const) {
      list.forEach((value, tagIndex) => {
        if (casefold(normalizeText(value)) === 'instrumental')
          issues.push(
            issue({ kind: 'section', id: section.id, field }, 'reserved_descriptor', {
              path: `${listPath}[${tagIndex}]`,
            }),
          );
      });
    }
    const durationIssue = numericIssue(
      section.duration,
      1,
      600,
      { kind: 'section', id: section.id, field: 'duration' },
      `${path}.duration_seconds`,
    );
    if (durationIssue) issues.push(durationIssue);
    if (section.duration.trim()) {
      const duration = Number(section.duration.trim());
      if (Number.isInteger(duration) && duration >= 1 && duration <= 600) totalDuration += duration;
    }

    const hidden = draft.instrumental || section.instrumental || section.kind === 'instrumental';
    if (!hidden) {
      const parsed = built.rowIssues.get(section.id) ?? [];
      for (const rowIssue of parsed) {
        issues.push(
          issue({ kind: 'lyrics', id: section.id, row: rowIssue.row }, rowIssue.code, {
            max: rowIssue.max,
            path: `${path}.lyrics[${rowIssue.row}]`,
          }),
        );
      }
      const parsedLines = section.lyrics.split(/\r?\n/u).flatMap((row) => {
        const trimmed = row.trim();
        if (!trimmed || /^\[.*\]$/u.test(trimmed)) return [];
        return [normalizeText(trimmed)];
      });
      totalLyricsLength += parsedLines.reduce((sum, line) => sum + codePointLength(line), 0);
    }
  }
  if (totalDuration > 1800)
    issues.push(issue(song('sections'), 'total_duration_exceeded', { path: 'sections' }));
  if (totalLyricsLength > STUDIO_LIMITS.sunoLyrics)
    issues.push(
      issue(song('lyrics'), 'lyrics_too_long', { max: STUDIO_LIMITS.sunoLyrics, path: 'sections' }),
    );

  if (built.lyrics) {
    if (!draft.language)
      issues.push(issue(song('language'), 'language_required', { path: 'language' }));
    else if (!isLanguageTag(draft.language))
      issues.push(issue(song('language'), 'invalid_language', { path: 'language' }));
  }
  return issues;
}
