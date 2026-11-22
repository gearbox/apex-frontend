import { http, HttpResponse } from 'msw';
import type { components } from '$lib/api/types';
import {
  makeArtist,
  makeCursorPage,
  makeMemory,
  type MockArtist,
  type MockMemory,
} from '../factories/studio';
import { MOCK_BASE_URL as BASE } from '../config';

type ArtistCreate = components['schemas']['ArtistCreate'];
type ArtistPatch = components['schemas']['ArtistPatch'];
type MemoryCreate = components['schemas']['MemoryCreate'];
type MemoryPatch = components['schemas']['MemoryPatch'];

let artists: MockArtist[] = [];
let memories: MockMemory[] = [];
let nextArtistId = 1;
let nextMemoryId = 1;

export function resetStudioMockStore(): void {
  artists = [];
  memories = [];
  nextArtistId = 1;
  nextMemoryId = 1;
}

function apiError(status: number, error: string, message: string) {
  return HttpResponse.json({ error, message, status_code: status }, { status });
}

function pagination(url: URL, defaultLimit = 30, maxLimit = 50) {
  const requested = Number(url.searchParams.get('limit'));
  const limit =
    Number.isInteger(requested) && requested > 0 ? Math.min(requested, maxLimit) : defaultLimit;
  const rawCursor = url.searchParams.get('cursor');
  const offset = rawCursor && /^\d+$/.test(rawCursor) ? Number(rawCursor) : 0;
  return { limit, offset };
}

function cursorPage<Item>(items: Item[], url: URL, defaultLimit = 30) {
  const { limit, offset } = pagination(url, defaultLimit);
  const pageItems = items.slice(offset, offset + limit);
  const hasMore = offset + pageItems.length < items.length;
  return makeCursorPage(pageItems, limit, hasMore, hasMore ? String(offset + limit) : null);
}

function diaryOrder(a: MockMemory, b: MockMemory): number {
  if (a.occurred_on !== b.occurred_on) {
    if (a.occurred_on === null) return 1;
    if (b.occurred_on === null) return -1;
    return b.occurred_on.localeCompare(a.occurred_on);
  }
  const created = b.created_at.localeCompare(a.created_at);
  return created || b.id.localeCompare(a.id);
}

function activeMemoryCount(artistId: string): number {
  return memories.filter((memory) => memory.artist_id === artistId && memory.status === 'active')
    .length;
}

export const studioHandlers = [
  http.get(`${BASE}/v1/studio/artists`, ({ request }) => {
    const url = new URL(request.url);
    const { limit } = pagination(url, 30);
    return HttpResponse.json(cursorPage(artists, url, limit));
  }),

  http.post(`${BASE}/v1/studio/artists`, async ({ request }) => {
    const body = (await request.json()) as ArtistCreate;
    if (artists.length >= 50) {
      return apiError(409, 'artist_limit_reached', 'The artist limit has been reached.');
    }
    if (artists.some((artist) => artist.name.toLowerCase() === body.name.trim().toLowerCase())) {
      return apiError(409, 'artist_name_conflict', 'An artist with this name already exists.');
    }
    const now = new Date().toISOString();
    const artist = makeArtist({
      ...body,
      id: `artist_mock_${String(nextArtistId++).padStart(3, '0')}`,
      name: body.name,
      persona: body.persona ?? null,
      voice_notes: body.voice_notes ?? null,
      default_language: body.default_language ?? null,
      aesthetic_references: body.aesthetic_references ?? [],
      style_tags: body.style_tags ?? [],
      global_avoid: body.global_avoid ?? [],
      created_at: now,
      updated_at: now,
    });
    artists.push(artist);
    return HttpResponse.json(artist, { status: 201 });
  }),

  http.get(`${BASE}/v1/studio/artists/:artist_id`, ({ params }) => {
    const artist = artists.find((item) => item.id === params.artist_id);
    return artist
      ? HttpResponse.json(artist)
      : apiError(404, 'artist_not_found', 'Artist not found.');
  }),

  http.patch(`${BASE}/v1/studio/artists/:artist_id`, async ({ params, request }) => {
    const index = artists.findIndex((item) => item.id === params.artist_id);
    if (index < 0) return apiError(404, 'artist_not_found', 'Artist not found.');
    const patch = (await request.json()) as ArtistPatch;
    if (
      patch.name !== undefined &&
      artists.some(
        (artist) =>
          artist.id !== params.artist_id &&
          artist.name.toLowerCase() === patch.name!.trim().toLowerCase(),
      )
    ) {
      return apiError(409, 'artist_name_conflict', 'An artist with this name already exists.');
    }
    artists[index] = { ...artists[index], ...patch, updated_at: new Date().toISOString() };
    return HttpResponse.json(artists[index]);
  }),

  http.delete(`${BASE}/v1/studio/artists/:artist_id`, ({ params }) => {
    const index = artists.findIndex((item) => item.id === params.artist_id);
    if (index < 0) return apiError(404, 'artist_not_found', 'Artist not found.');
    artists.splice(index, 1);
    memories = memories.filter((memory) => memory.artist_id !== params.artist_id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/v1/studio/artists/:artist_id/memories`, ({ params, request }) => {
    const artistId = params.artist_id as string;
    if (!artists.some((artist) => artist.id === artistId)) {
      return apiError(404, 'artist_not_found', 'Artist not found.');
    }
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? 'active';
    const items = memories
      .filter((memory) => memory.artist_id === artistId && memory.status === status)
      .sort(diaryOrder);
    return HttpResponse.json(cursorPage(items, url));
  }),

  http.post(`${BASE}/v1/studio/artists/:artist_id/memories`, async ({ params, request }) => {
    const artistId = params.artist_id as string;
    if (!artists.some((artist) => artist.id === artistId)) {
      return apiError(404, 'artist_not_found', 'Artist not found.');
    }
    if (activeMemoryCount(artistId) >= 200) {
      return apiError(409, 'memory_limit_reached', 'The active memory limit has been reached.');
    }
    const body = (await request.json()) as MemoryCreate;
    const now = new Date().toISOString();
    const memory = makeMemory({
      ...body,
      id: `memory_mock_${String(nextMemoryId++).padStart(3, '0')}`,
      artist_id: artistId,
      occurred_on: body.occurred_on ?? null,
      themes: body.themes ?? [],
      imagery: body.imagery ?? [],
      salience: body.salience ?? 3,
      status: 'active',
      origin: 'user',
      created_at: now,
      updated_at: now,
    });
    memories.push(memory);
    return HttpResponse.json(memory, { status: 201 });
  }),

  http.get(`${BASE}/v1/studio/memories/:memory_id`, ({ params }) => {
    const memory = memories.find((item) => item.id === params.memory_id);
    return memory
      ? HttpResponse.json(memory)
      : apiError(404, 'memory_not_found', 'Memory not found.');
  }),

  http.patch(`${BASE}/v1/studio/memories/:memory_id`, async ({ params, request }) => {
    const index = memories.findIndex((item) => item.id === params.memory_id);
    if (index < 0) return apiError(404, 'memory_not_found', 'Memory not found.');
    const patch = (await request.json()) as MemoryPatch;
    const memory = memories[index];
    if (
      patch.status === 'active' &&
      memory.status === 'archived' &&
      activeMemoryCount(memory.artist_id) >= 200
    ) {
      return apiError(409, 'memory_limit_reached', 'The active memory limit has been reached.');
    }
    memories[index] = { ...memory, ...patch, updated_at: new Date().toISOString() };
    return HttpResponse.json(memories[index]);
  }),

  http.delete(`${BASE}/v1/studio/memories/:memory_id`, ({ params }) => {
    const index = memories.findIndex((item) => item.id === params.memory_id);
    if (index < 0) return apiError(404, 'memory_not_found', 'Memory not found.');
    memories.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
