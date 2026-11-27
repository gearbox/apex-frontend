import { describe, expect, it } from 'vitest';
import { newDraft } from './songDraft';
import {
  createLocalSongDraftStore,
  createMemorySongDraftStore,
  type StoredSongDraft,
} from './songDraftStore';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function record(savedAt: string, title: string): StoredSongDraft {
  return {
    savedAt,
    base: { plan: null, lyrics: null },
    draft: newDraft('blank', title, 'en', () => 'section'),
  };
}

describe('song draft store', () => {
  it('keys records by user and track and lists only that user', () => {
    const store = createLocalSongDraftStore(new MemoryStorage());
    store.save('u1', 't1', record('2026-01-01T00:00:00Z', 'one'));
    store.save('u2', 't1', record('2026-01-02T00:00:00Z', 'two'));
    expect(store.load('u1', 't1')?.draft.title).toBe('one');
    expect(store.list('u1')).toEqual([{ trackId: 't1', savedAt: '2026-01-01T00:00:00Z' }]);
  });

  it('evicts the oldest user record after the configured cap', () => {
    const store = createLocalSongDraftStore(new MemoryStorage(), 2);
    store.save('u1', 'old', record('2026-01-01T00:00:00Z', 'old'));
    store.save('u1', 'middle', record('2026-01-02T00:00:00Z', 'middle'));
    store.save('u1', 'new', record('2026-01-03T00:00:00Z', 'new'));
    expect(
      store
        .list('u1')
        .map((item) => item.trackId)
        .sort(),
    ).toEqual(['middle', 'new']);
  });

  it('removes corrupt records on load', () => {
    const storage = new MemoryStorage();
    storage.setItem('apex:studio:song-draft:v1:u1:t1', '{broken');
    const store = createLocalSongDraftStore(storage);
    expect(store.load('u1', 't1')).toBeNull();
    expect(storage.getItem('apex:studio:song-draft:v1:u1:t1')).toBeNull();
  });

  it('marks storage unavailable after a storage exception and clears memory drafts by user', () => {
    const store = createMemorySongDraftStore();
    store.save('u1', 't1', record('2026-01-01T00:00:00Z', 'one'));
    store.save('u2', 't1', record('2026-01-01T00:00:00Z', 'two'));
    store.clearUser('u1');
    expect(store.load('u1', 't1')).toBeNull();
    expect(store.load('u2', 't1')?.draft.title).toBe('two');

    const broken = createLocalSongDraftStore({
      get length(): number {
        throw new Error('denied');
      },
      clear() {},
      getItem() {
        return null;
      },
      key() {
        return null;
      },
      removeItem() {},
      setItem() {},
    });
    expect(broken.list('u1')).toEqual([]);
    expect(broken.available).toBe(false);
  });
});
