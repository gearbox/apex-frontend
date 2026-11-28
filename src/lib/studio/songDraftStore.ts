import { browser } from '$app/environment';
import { STORAGE_KEYS } from '$lib/utils/constants';
import type { Pair, SongDraft } from './songDraft';

export interface StoredSongDraft {
  savedAt: string;
  base: Pair;
  draft: SongDraft;
}

export interface SongDraftStore {
  readonly available: boolean;
  load(userId: string, trackId: string): StoredSongDraft | null;
  save(userId: string, trackId: string, record: StoredSongDraft): boolean;
  remove(userId: string, trackId: string): void;
  list(userId: string): Array<{ trackId: string; savedAt: string }>;
  clearUser(userId: string): void;
}

function draftKey(userId: string, trackId: string): string {
  return `${STORAGE_KEYS.STUDIO_SONG_DRAFT}:${userId}:${trackId}`;
}

function parseRecord(raw: string): StoredSongDraft | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredSongDraft>;
    const draft = value.draft as SongDraft | undefined;
    const isStringList = (items: unknown): items is string[] =>
      Array.isArray(items) && items.every((item) => typeof item === 'string');
    const sectionsValid =
      Array.isArray(draft?.sections) &&
      draft.sections.every(
        (section) =>
          !!section &&
          typeof section.id === 'string' &&
          typeof section.kind === 'string' &&
          typeof section.label === 'string' &&
          typeof section.instrumental === 'boolean' &&
          typeof section.duration === 'string' &&
          typeof section.notes === 'string' &&
          typeof section.lyrics === 'string' &&
          isStringList(section.delivery) &&
          isStringList(section.styleTags) &&
          isStringList(section.styleAvoid),
      );
    if (
      typeof value.savedAt === 'string' &&
      !Number.isNaN(Date.parse(value.savedAt)) &&
      value.base &&
      (value.base.plan === null || typeof value.base.plan === 'string') &&
      (value.base.lyrics === null || typeof value.base.lyrics === 'string') &&
      draft &&
      typeof draft.title === 'string' &&
      typeof draft.idea === 'string' &&
      typeof draft.tempo === 'string' &&
      typeof draft.instrumental === 'boolean' &&
      typeof draft.language === 'string' &&
      (draft.lineSyllables === null ||
        (!!draft.lineSyllables &&
          Number.isInteger(draft.lineSyllables.min) &&
          Number.isInteger(draft.lineSyllables.max))) &&
      isStringList(draft.styleTags) &&
      isStringList(draft.styleAvoid) &&
      isStringList(draft.references) &&
      sectionsValid
    ) {
      return value as StoredSongDraft;
    }
  } catch {
    // Corrupt JSON is treated like an absent draft and removed by the caller.
  }
  return null;
}

export function createLocalSongDraftStore(
  storage: Storage | undefined,
  maxPerUser = 20,
): SongDraftStore {
  let usable = storage !== undefined;
  const hasPrefix = (key: string, userId: string) =>
    key.startsWith(`${STORAGE_KEYS.STUDIO_SONG_DRAFT}:${userId}:`);

  function markUnavailable(): void {
    usable = false;
  }

  return {
    get available() {
      return usable;
    },
    // An empty user id would file the draft under a key that sign-out never clears.
    load(userId, trackId) {
      if (!usable || !storage || !userId) return null;
      const key = draftKey(userId, trackId);
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const record = parseRecord(raw);
        if (!record) storage.removeItem(key);
        return record;
      } catch {
        markUnavailable();
        return null;
      }
    },
    save(userId, trackId, record) {
      if (!usable || !storage || !userId) return false;
      try {
        const snapshot = JSON.parse(JSON.stringify(record)) as StoredSongDraft;
        const key = draftKey(userId, trackId);
        storage.setItem(key, JSON.stringify(snapshot));
        const records: Array<{ key: string; savedAt: string }> = [];
        const candidates = Array.from({ length: storage.length }, (_, index) => storage.key(index));
        for (const candidate of candidates) {
          if (!candidate || !hasPrefix(candidate, userId) || candidate === key) continue;
          const parsed = parseRecord(storage.getItem(candidate) ?? '');
          if (parsed) records.push({ key: candidate, savedAt: parsed.savedAt });
          else storage.removeItem(candidate);
        }
        records.push({ key, savedAt: snapshot.savedAt });
        records.sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
        while (records.length > Math.max(1, maxPerUser)) {
          const oldest = records.shift();
          if (oldest) storage.removeItem(oldest.key);
        }
        return true;
      } catch {
        markUnavailable();
        return false;
      }
    },
    remove(userId, trackId) {
      if (!storage) return;
      try {
        storage.removeItem(draftKey(userId, trackId));
      } catch {
        markUnavailable();
      }
    },
    list(userId) {
      if (!usable || !storage) return [];
      try {
        const records: Array<{ trackId: string; savedAt: string }> = [];
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key || !hasPrefix(key, userId)) continue;
          const record = parseRecord(storage.getItem(key) ?? '');
          if (!record) {
            storage.removeItem(key);
            continue;
          }
          records.push({
            trackId: key.slice(`${STORAGE_KEYS.STUDIO_SONG_DRAFT}:${userId}:`.length),
            savedAt: record.savedAt,
          });
        }
        return records;
      } catch {
        markUnavailable();
        return [];
      }
    },
    clearUser(userId) {
      if (!storage) return;
      try {
        const keys: string[] = [];
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (key && hasPrefix(key, userId)) keys.push(key);
        }
        for (const key of keys) storage.removeItem(key);
      } catch {
        markUnavailable();
      }
    },
  };
}

export function createMemorySongDraftStore(): SongDraftStore {
  const memory = new Map<string, StoredSongDraft>();
  let usable = true;
  return {
    get available() {
      return usable;
    },
    load(userId, trackId) {
      const record = memory.get(draftKey(userId, trackId));
      return record ? JSON.parse(JSON.stringify(record)) : null;
    },
    save(userId, trackId, record) {
      try {
        memory.set(draftKey(userId, trackId), JSON.parse(JSON.stringify(record)));
        return true;
      } catch {
        usable = false;
        return false;
      }
    },
    remove(userId, trackId) {
      memory.delete(draftKey(userId, trackId));
    },
    list(userId) {
      const prefix = `${STORAGE_KEYS.STUDIO_SONG_DRAFT}:${userId}:`;
      return [...memory.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, record]) => ({ trackId: key.slice(prefix.length), savedAt: record.savedAt }));
    },
    clearUser(userId) {
      const prefix = `${STORAGE_KEYS.STUDIO_SONG_DRAFT}:${userId}:`;
      for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
    },
  };
}

function browserStorage(): Storage | undefined {
  if (!browser) return undefined;
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export const songDraftStore = createLocalSongDraftStore(browserStorage());
