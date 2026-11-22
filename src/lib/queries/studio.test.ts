import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../mocks/config';
import { ApiRequestError } from '$lib/api/errors';
import {
  artistQueryOptions,
  artistsQueryOptions,
  createArtistMutationOptions,
  createMemoryMutationOptions,
  deleteArtistMutationOptions,
  deleteMemoryMutationOptions,
  memoriesInfiniteQueryOptions,
  studioKeys,
  updateArtistMutationOptions,
  updateMemoryMutationOptions,
} from './studio';
import { makeArtist, makeMemory } from '../../mocks/factories/studio';

afterEach(() => vi.restoreAllMocks());

describe('studio query options', () => {
  it('creates and paginates artists and memories through the studio mocks', async () => {
    const artists = await artistsQueryOptions().queryFn();
    expect(artists.items).toEqual([]);
    expect(artists.has_more).toBe(false);

    const artist = makeArtist({ id: 'artist_query_test' });
    server.use(
      http.get(`${BASE}/v1/studio/artists`, () =>
        HttpResponse.json({ items: [artist], limit: 50, has_more: false, next_cursor: null }),
      ),
    );
    expect(await artistsQueryOptions().queryFn()).toMatchObject({ items: [artist] });

    server.use(
      http.get(`${BASE}/v1/studio/artists/:artist_id/memories`, ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({
          items: [makeMemory({ artist_id: 'artist_query_test', status: 'archived' })],
          limit: Number(url.searchParams.get('limit')),
          has_more: false,
          next_cursor: null,
        });
      }),
    );
    const options = memoriesInfiniteQueryOptions('artist_query_test', 'archived');
    expect(options.queryKey).toEqual(studioKeys.memories('artist_query_test', 'archived'));
    expect(await options.queryFn({ pageParam: null })).toMatchObject({
      items: [{ status: 'archived' }],
    });
  });

  it('artistsQueryOptions throws when the 50 item page says there are more results', async () => {
    server.use(
      http.get(`${BASE}/v1/studio/artists`, () =>
        HttpResponse.json({ items: [], limit: 50, has_more: true, next_cursor: 'more' }),
      ),
    );

    await expect(artistsQueryOptions().queryFn()).rejects.toMatchObject({
      name: 'ApiRequestError',
      error: 'invalid_pagination',
    });
  });

  it('converts API error envelopes to ApiRequestError with the response status', async () => {
    await expect(artistQueryOptions('missing-artist').queryFn()).rejects.toMatchObject({
      name: 'ApiRequestError',
      error: 'artist_not_found',
      status_code: 404,
    } satisfies Partial<ApiRequestError>);
  });

  it('invalidates or removes exactly the artist mutation keys', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
    const remove = vi.spyOn(qc, 'removeQueries').mockReturnValue(undefined);
    const set = vi.spyOn(qc, 'setQueryData');
    const artist = makeArtist({ id: 'artist_1' });

    createArtistMutationOptions(qc).onSuccess();
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      studioKeys.artists(),
    ]);
    invalidate.mockClear();

    updateArtistMutationOptions(qc).onSuccess(artist, { id: artist.id });
    expect(set).toHaveBeenCalledWith(studioKeys.artist(artist.id), artist);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      studioKeys.artists(),
    ]);
    invalidate.mockClear();

    deleteArtistMutationOptions(qc).onSuccess(undefined, artist.id);
    expect(remove.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      studioKeys.artist(artist.id),
      [...studioKeys.artist(artist.id), 'memories'],
    ]);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      studioKeys.artists(),
    ]);
    qc.clear();
  });

  it('invalidates the correct memory status lists for each memory mutation', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
    const artistId = 'artist_memories';

    createMemoryMutationOptions(qc).onSuccess(undefined, { artistId });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      studioKeys.memories(artistId, 'active'),
    ]);
    invalidate.mockClear();

    updateMemoryMutationOptions(qc).onSuccess(undefined, { artistId });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      studioKeys.memories(artistId, 'active'),
      studioKeys.memories(artistId, 'archived'),
    ]);
    invalidate.mockClear();

    deleteMemoryMutationOptions(qc).onSuccess(undefined, { artistId });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      studioKeys.memories(artistId, 'active'),
      studioKeys.memories(artistId, 'archived'),
    ]);
    qc.clear();
  });
});
