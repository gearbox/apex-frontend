import { describe, expect, it } from 'vitest';
import { buildSong, newDraft } from './songDraft';
import { validateSong } from './songValidation';

function validate(draft: ReturnType<typeof newDraft>) {
  return validateSong(draft, buildSong(draft));
}

describe('validateSong', () => {
  it('requires a normalized title and constrains tempo to an integer range', () => {
    const draft = newDraft('blank', '  ', '', () => 's1');
    draft.tempo = '240.5';
    expect(validate(draft).map((issue) => issue.code)).toEqual([
      'empty_after_normalization',
      'out_of_range',
    ]);
  });

  it('checks duplicate/conflicting global tags and reserved tempo tags', () => {
    const draft = newDraft('blank', 'Song', '', () => 's1');
    draft.styleTags = ['Warm', 'warm', '120 BPM'];
    draft.styleAvoid = ['WARM'];
    expect(validate(draft).map((issue) => issue.code)).toEqual([
      'duplicate_tag',
      'tag_conflict',
      'reserved_tempo_tag',
    ]);
  });

  it('maps delivery row issues to their textarea row and requires lyrics language', () => {
    const draft = newDraft('blank', 'Song', '', () => 's1');
    const sectionId = draft.sections.push({
      id: 'verse',
      kind: 'verse',
      label: '',
      delivery: [],
      styleTags: [],
      styleAvoid: [],
      instrumental: false,
      duration: '',
      notes: '',
      lyrics: '[Verse 2]\n[soft]\nline\n[unfinished]',
    });
    expect(sectionId).toBe(1);
    expect(
      validate(draft).map((issue) => [
        issue.code,
        issue.target?.kind,
        issue.target?.kind === 'lyrics' ? issue.target.row : null,
      ]),
    ).toEqual([
      ['looks_like_header', 'lyrics', 0],
      ['delivery_without_line', 'lyrics', 3],
      ['language_required', 'song', null],
    ]);
  });

  it('does not validate hidden lyrics that are not sent', () => {
    let section = 0;
    const draft = newDraft('verse_chorus', 'Song', '', () => `section-${++section}`);
    draft.instrumental = true;
    draft.sections[0]!.lyrics = '[Verse 2]';
    expect(validate(draft)).toEqual([]);
  });

  it('checks duration totals, notes, and descriptor restrictions', () => {
    const draft = newDraft('blank', 'Song', '', () => 'unused');
    draft.sections = [1, 2, 3, 4].map((value) => ({
      id: `s${value}`,
      kind: 'verse' as const,
      label: '',
      delivery: ['instrumental'],
      styleTags: [],
      styleAvoid: [],
      instrumental: false,
      duration: '600',
      notes: 'n'.repeat(1001),
      lyrics: '',
    }));
    expect(validate(draft).map((issue) => issue.code)).toEqual([
      'too_long_after_normalization',
      'reserved_descriptor',
      'too_long_after_normalization',
      'reserved_descriptor',
      'too_long_after_normalization',
      'reserved_descriptor',
      'too_long_after_normalization',
      'reserved_descriptor',
      'total_duration_exceeded',
    ]);
  });
});
