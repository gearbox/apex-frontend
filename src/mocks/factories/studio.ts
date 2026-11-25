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

export type MockProjectProfile = components['schemas']['ProjectProfileOut'];
export type MockTrack = components['schemas']['TrackOut'];
type MockTrackDetail = components['schemas']['TrackDetail'];
type MockPlanVersion = components['schemas']['PlanVersionDetail'];
type MockLyricsVersion = components['schemas']['LyricsVersionDetail'];
export function makeProjectProfile(
  overrides: Partial<MockProjectProfile> = {},
): MockProjectProfile {
  const now = new Date().toISOString();
  return {
    library_project_id: 'project_mock_001',
    name: 'First release',
    release_kind: 'single',
    artist_id: null,
    concept: null,
    track_count: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
export function makeTrack(overrides: Partial<MockTrack> = {}): MockTrack {
  const now = new Date().toISOString();
  return {
    id: 'track_mock_001',
    library_project_id: 'project_mock_001',
    position: 0,
    title: 'First track',
    current_plan_version_id: null,
    current_lyrics_version_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
export function makeTrackDetail(overrides: Partial<MockTrackDetail> = {}): MockTrackDetail {
  return { ...makeTrack(), current_plan: null, current_lyrics: null, ...overrides };
}
export function makePlanVersion(overrides: Partial<MockPlanVersion> = {}): MockPlanVersion {
  return {
    id: 'plan_mock_001',
    track_id: 'track_mock_001',
    version_number: 1,
    parent_version_id: null,
    origin: 'user',
    schema_version: 2,
    content_hash: 'hash',
    created_at: new Date().toISOString(),
    is_current: true,
    content: { title: 'First track', instrumental: false, references: [], sections: [] },
    kind: 'plan',
    ...overrides,
  };
}
export function makeLyricsVersion(overrides: Partial<MockLyricsVersion> = {}): MockLyricsVersion {
  return {
    id: 'lyrics_mock_001',
    track_id: 'track_mock_001',
    version_number: 1,
    parent_version_id: null,
    based_on_plan_version_id: 'plan_mock_001',
    origin: 'user',
    schema_version: 1,
    content_hash: 'hash',
    created_at: new Date().toISOString(),
    is_current: true,
    content: { language: 'en', sections: [] },
    kind: 'lyrics',
    ...overrides,
  };
}
