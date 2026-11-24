import { describe, expect, it } from 'vitest';
import { MemoryDraft } from './MemoryDraft.svelte';

const source = {
  title: 'Body',
  body: 'Body',
  occurred_on: null,
  themes: ['one'],
  imagery: ['two'],
  salience: 4,
};

describe('MemoryDraft', () => {
  it('derives titleEdited when loading create and edit drafts', () => {
    const draft = new MemoryDraft('create');
    expect(draft.titleEdited).toBe(false);
    draft.load(source);
    expect(draft.titleEdited).toBe(false);
    draft.load({ ...source, title: 'Custom' });
    expect(draft.titleEdited).toBe(true);
    expect(new MemoryDraft('edit', source).titleEdited).toBe(true);
    draft.reset();
    expect(draft.titleEdited).toBe(false);
  });

  it('updates only an underived title when the body changes', () => {
    const draft = new MemoryDraft('create');
    draft.setBody('First line\nSecond line');
    expect(draft.title).toBe('First line');
    draft.setTitle('Custom');
    draft.setBody('Changed');
    expect(draft.title).toBe('Custom');
  });

  it('ignores date and importance defaults when checking emptiness', () => {
    const draft = new MemoryDraft('create');
    draft.salience = 5;
    expect(draft.occurredOn).not.toBe('');
    expect(draft.isEmpty).toBe(true);
    draft.setTitle('Custom');
    expect(draft.isEmpty).toBe(false);
    draft.setTitle('  ');
    draft.themes = ['theme'];
    expect(draft.isEmpty).toBe(false);
    draft.themes = [];
    draft.imagery = ['image'];
    expect(draft.isEmpty).toBe(false);
    draft.imagery = [];
    draft.setBody('body');
    expect(draft.isEmpty).toBe(false);
  });

  it('maps payloads including date semantics and independent arrays', () => {
    const draft = new MemoryDraft('create', source);
    draft.setTitle('  Custom  ');
    const payload = draft.toPayload();
    expect(payload).toEqual({
      title: 'Custom',
      body: 'Body',
      themes: ['one'],
      imagery: ['two'],
      salience: 4,
    });
    payload.themes.push('extra');
    payload.imagery.push('extra');
    expect(draft.themes).toEqual(['one']);
    expect(draft.imagery).toEqual(['two']);
    draft.occurredOn = '2026-10-01';
    expect(draft.toPayload().occurred_on).toBe('2026-10-01');
    expect(new MemoryDraft('edit', source).toPayload().occurred_on).toBeNull();
  });
});
