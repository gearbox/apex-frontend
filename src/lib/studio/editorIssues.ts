import { validationIssues } from './formErrors';
import { lineRange } from './sunoImport';
import type { BuiltSong } from './songDraft';
import type { DraftIssue, DraftTarget } from './songValidation';

function sectionField(path: string): string {
  if (path.includes('.delivery')) return 'delivery';
  if (path.includes('.style.avoid')) return 'styleAvoid';
  if (path.includes('.style.tags')) return 'styleTags';
  if (path.endsWith('.label')) return 'label';
  if (path.endsWith('.notes')) return 'notes';
  if (path.endsWith('.duration_seconds')) return 'duration';
  if (path.endsWith('.instrumental')) return 'instrumental';
  return 'kind';
}

/** Issues of one control: a song field, or a section field when `sectionId` is given. */
export function targetIssues(
  issues: readonly DraftIssue[],
  field: string,
  sectionId?: string,
): DraftIssue[] {
  return issues.filter(({ target }) =>
    sectionId === undefined
      ? target?.kind === 'song' && target.field === field
      : target?.kind === 'section' && target.id === sectionId && target.field === field,
  );
}

/** Focus a lyrics textarea and select one of its rows (0-based). */
export function selectLyricsRow(textarea: HTMLTextAreaElement, row: number): void {
  const range = lineRange(textarea.value, row + 1);
  textarea.focus();
  if (range) textarea.setSelectionRange(range.start, range.end);
}

export function mapServerIssues(error: unknown, snapshot: BuiltSong): DraftIssue[] {
  return validationIssues(error).map(({ path, code }) => {
    const lyricsMatch = /^sections\[(\d+)\]\.lines\[(\d+)\]/u.exec(path);
    if (lyricsMatch) {
      const lyricsSectionIndex = Number(lyricsMatch[1]);
      const lineIndex = Number(lyricsMatch[2]);
      const id = snapshot.lyricsSectionIds[lyricsSectionIndex];
      const row = id ? snapshot.rows.get(id)?.[lineIndex] : undefined;
      if (id && row !== undefined) {
        return { target: { kind: 'lyrics', id, row }, code, path } satisfies DraftIssue;
      }
    }

    const planMatch = /^sections\[(\d+)\]/u.exec(path);
    if (planMatch) {
      const section = snapshot.plan.sections[Number(planMatch[1])];
      if (section) {
        const target: DraftTarget = { kind: 'section', id: section.id, field: sectionField(path) };
        return { target, code, path } satisfies DraftIssue;
      }
    }
    if (path === 'title') return { target: { kind: 'song', field: 'title' }, code, path };
    if (path === 'tempo_bpm') return { target: { kind: 'song', field: 'tempo' }, code, path };
    if (path === 'language') return { target: { kind: 'song', field: 'language' }, code, path };
    if (path.startsWith('global_style.tags'))
      return { target: { kind: 'song', field: 'styleTags' }, code, path };
    if (path.startsWith('global_style.avoid'))
      return { target: { kind: 'song', field: 'styleAvoid' }, code, path };
    if (path.startsWith('references'))
      return { target: { kind: 'song', field: 'references' }, code, path };
    if (path === 'idea') return { target: { kind: 'song', field: 'idea' }, code, path };
    if (path === 'sections' && code === 'lyrics_too_long')
      return { target: { kind: 'song', field: 'lyrics' }, code, path };
    return { target: null, code, path };
  });
}
