import { describe, expect, it } from 'vitest';
import type { LyricsDocument, PlanDocument } from './songDraft';
import { createMemorySongDraftStore } from './songDraftStore';
import { SongEditor } from './SongEditor.svelte';

/** An editor on a saved song: a sung verse and an instrumental solo. */
function savedSong() {
  const store = createMemorySongDraftStore();
  const editor = new SongEditor({
    store,
    userId: 'u1',
    trackId: 't1',
    makeId: () => 'unused',
    now: () => new Date('2026-01-01T00:00:00Z'),
  });
  const plan: PlanDocument = {
    title: 'Song',
    instrumental: false,
    references: [],
    sections: [
      { id: 'verse', kind: 'verse', delivery: [], instrumental: false },
      { id: 'solo', kind: 'chorus', delivery: [], instrumental: true },
    ],
  };
  const lyrics: LyricsDocument = {
    language: 'en',
    sections: [{ section_id: 'verse', lines: [{ text: 'Sung', delivery: [] }] }],
  };
  editor.start({ plan: 'p1', lyrics: 'l1' }, { plan, lyrics }, { language: 'en' });
  return { editor, store };
}

describe('SongEditor draft operations', () => {
  it('adds, moves, duplicates and removes sections with their lyrics', () => {
    let id = 0;
    const editor = new SongEditor({
      store: createMemorySongDraftStore(),
      userId: 'u1',
      trackId: 't1',
      makeId: () => `section-${++id}`,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    editor.start({ plan: null, lyrics: null }, { plan: null, lyrics: null }, { language: 'en' });
    editor.create('blank', 'Song', 'en');
    const verse = editor.addSection('verse');
    const chorus = editor.addSection('chorus');
    editor.draft!.sections[0]!.lyrics = '[soft]\nA line';
    editor.moveSection(chorus, -1);
    expect(editor.draft!.sections.map((section) => section.id)).toEqual([chorus, verse]);
    expect(editor.draft!.sections[1]!.lyrics).toBe('[soft]\nA line');
    const duplicate = editor.duplicateSection(verse);
    expect(editor.draft!.sections.map((section) => section.id)).toEqual([chorus, verse, duplicate]);
    expect(editor.draft!.sections[2]!.lyrics).toBe('[soft]\nA line');
    editor.removeSection(verse);
    expect(editor.draft!.sections.map((section) => section.id)).toEqual([chorus, duplicate]);
  });

  it('keeps a pending delivery row on the device', () => {
    const { editor, store } = savedSong();
    editor.draft!.sections[0]!.lyrics += '\n[whispered]';
    expect(editor.dirty).toBe(false);
    expect(editor.issues.map((item) => item.code)).toEqual(['delivery_without_line']);
    expect(editor.needsLocalCopy).toBe(true);
    editor.persist();
    expect(store.load('u1', 't1')?.draft.sections[0]!.lyrics).toBe('Sung\n[whispered]');
  });

  it('keeps hidden instrumental text on the device', () => {
    const { editor, store } = savedSong();
    editor.draft!.sections[1]!.lyrics = 'Hummed idea';
    expect(editor.dirty).toBe(false);
    expect(editor.needsLocalCopy).toBe(true);
    editor.persist();
    expect(store.load('u1', 't1')?.draft.sections[1]!.lyrics).toBe('Hummed idea');
    editor.draft!.sections[1]!.lyrics = '';
    expect(editor.needsLocalCopy).toBe(false);
    editor.persist();
    expect(store.load('u1', 't1')).toBeNull();
  });

  it('owns the stored record only until another editor writes it', () => {
    const { editor, store } = savedSong();
    expect(editor.ownsStoredRecord()).toBe(true);
    editor.draft!.title = 'Changed';
    editor.persist();
    expect(editor.ownsStoredRecord()).toBe(true);
    store.save('u1', 't1', { ...store.load('u1', 't1')!, savedAt: '2026-02-01T00:00:00Z' });
    expect(editor.ownsStoredRecord()).toBe(false);
    editor.restore(store.load('u1', 't1')!, { plan: null, lyrics: null });
    expect(editor.ownsStoredRecord()).toBe(true);
  });

  it('persists only dirty drafts and removes them once clean', () => {
    const store = createMemorySongDraftStore();
    const editor = new SongEditor({
      store,
      userId: 'u1',
      trackId: 't1',
      makeId: () => 's1',
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    editor.start({ plan: null, lyrics: null }, { plan: null, lyrics: null }, { language: 'en' });
    editor.create('blank', 'Song', 'en');
    editor.persist();
    expect(store.load('u1', 't1')?.draft.title).toBe('Song');
    editor.rebase({ plan: 'p1', lyrics: null }, { plan: editor.built!.plan, lyrics: null });
    expect(editor.dirty).toBe(false);
    editor.persist();
    expect(store.load('u1', 't1')).toBeNull();
  });
});
