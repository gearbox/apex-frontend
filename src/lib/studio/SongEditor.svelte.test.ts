import { describe, expect, it } from 'vitest';
import { createMemorySongDraftStore } from './songDraftStore';
import { SongEditor } from './SongEditor.svelte';

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
