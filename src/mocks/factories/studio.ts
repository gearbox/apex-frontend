import type { components } from '$lib/api/types';

export type MockArtist = components['schemas']['ArtistOut'];
export type MockMemory = components['schemas']['MemoryOut'];

export function makeArtist(overrides: Partial<MockArtist> = {}): MockArtist {
  const now = new Date().toISOString();
  return {
    id: 'artist_mock_001',
    name: 'Mira Vale',
    persona: null,
    voice_notes: null,
    default_language: null,
    aesthetic_references: [],
    style_tags: [],
    global_avoid: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeMemory(overrides: Partial<MockMemory> = {}): MockMemory {
  const now = new Date().toISOString();
  return {
    id: 'memory_mock_001',
    artist_id: 'artist_mock_001',
    title: 'The first show',
    body: 'A small room filled with warm light.',
    occurred_on: null,
    themes: [],
    imagery: [],
    salience: 3,
    status: 'active',
    origin: 'user',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeCursorPage<Item>(
  items: Item[],
  limit: number,
  hasMore: boolean,
  nextCursor: string | null = null,
) {
  return {
    items,
    limit,
    has_more: hasMore,
    next_cursor: nextCursor,
  };
}
