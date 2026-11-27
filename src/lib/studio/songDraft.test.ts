import { describe, expect, it } from 'vitest';
import { buildSong, draftFromDocuments, newDraft, sameLyrics, samePlan } from './songDraft';

const plan = {
  title: '  Demo  song ',
  instrumental: false,
  references: [],
  global_style: { tags: [' dream pop '], avoid: [] },
  sections: [
    { id: 'verse', kind: 'verse' as const, label: null, delivery: [], instrumental: false },
    { id: 'chorus', kind: 'chorus' as const, label: null, delivery: [], instrumental: false },
  ],
};

describe('song draft document mapping', () => {
  it('keeps lyrics in plan order even when the stored lyrics are reversed', () => {
    const draft = draftFromDocuments(
      plan,
      {
        language: 'en',
        sections: [
          { section_id: 'chorus', lines: [{ text: 'Chorus line', delivery: [] }] },
          { section_id: 'verse', lines: [{ text: 'Verse line', delivery: ['soft'] }] },
        ],
      },
      { language: '' },
    );
    expect(draft.sections.map((section) => section.id)).toEqual(['verse', 'chorus']);
    expect(draft.sections.map((section) => section.lyrics)).toEqual([
      '[soft]\nVerse line',
      'Chorus line',
    ]);
    expect(buildSong(draft).lyrics?.sections.map((section) => section.section_id)).toEqual([
      'verse',
      'chorus',
    ]);
  });

  it('builds defaults and compares the built document with the base canonically', () => {
    const lyrics = {
      language: 'en',
      sections: [{ section_id: 'verse', lines: [{ text: 'Line', delivery: [] }] }],
    };
    const draft = draftFromDocuments({ ...plan, title: 'Demo song' }, lyrics, { language: '' });
    const built = buildSong(draft);
    expect(
      samePlan(built.plan, {
        ...plan,
        title: 'Demo song',
        global_style: { tags: ['dream pop'], avoid: [] },
      }),
    ).toBe(true);
    expect(sameLyrics(built.lyrics, lyrics)).toBe(true);
  });

  it('keeps lyrics in the draft but hides them from instrumental documents', () => {
    const draft = draftFromDocuments(plan, null, { language: 'en' });
    draft.sections[0]!.lyrics = '[soft]\nVerse line';
    draft.sections[1]!.lyrics = 'Chorus line';
    draft.sections[0]!.instrumental = true;
    const built = buildSong(draft);
    expect(built.lyrics?.sections.map((section) => section.section_id)).toEqual(['chorus']);
    expect(built.hiddenLines.get('verse')).toBe(1);
    draft.instrumental = true;
    expect(buildSong(draft).lyrics).toBeNull();
    expect(draft.sections[0]!.lyrics).toBe('[soft]\nVerse line');
  });

  it('creates only the blank or locked Verse–Chorus template', () => {
    let id = 0;
    const makeId = () => `section-${++id}`;
    expect(newDraft('blank', 'Title', 'en', makeId).sections).toEqual([]);
    expect(
      newDraft('verse_chorus', 'Title', 'en', makeId).sections.map((item) => item.kind),
    ).toEqual(['verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus']);
  });
});
