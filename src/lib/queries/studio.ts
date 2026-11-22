import apiClient from '$lib/api/client';
import { ApiRequestError, parseApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';
import type { QueryClient } from '@tanstack/svelte-query';

type Artist = components['schemas']['ArtistOut'];
type ArtistCreate = components['schemas']['ArtistCreate'];
type ArtistPatch = components['schemas']['ArtistPatch'];
type MemoryCreate = components['schemas']['MemoryCreate'];
type MemoryPatch = components['schemas']['MemoryPatch'];
type MemoryStatus = components['schemas']['StudioMemoryStatus'];

export const studioKeys = {
  all: ['studio'] as const,
  artists: () => [...studioKeys.all, 'artists'] as const,
  artist: (id: string) => [...studioKeys.all, 'artist', id] as const,
  memories: (id: string, status: MemoryStatus) =>
    [...studioKeys.artist(id), 'memories', status] as const,
};
export function artistsQueryOptions() {
  return {
    queryKey: studioKeys.artists(),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/v1/studio/artists', {
        params: { query: { limit: 50 } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      if (data.has_more)
        throw new ApiRequestError({
          error: 'invalid_pagination',
          message: 'Artists list exceeds the expected limit.',
          status_code: 0,
        });
      return data;
    },
  };
}
export function artistQueryOptions(id: string) {
  return {
    queryKey: studioKeys.artist(id),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/v1/studio/artists/{artist_id}', {
        params: { path: { artist_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
  };
}
export function createArtistMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (body: ArtistCreate) => {
      const { data, error, response } = await apiClient.POST('/v1/studio/artists', { body });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: studioKeys.artists() });
    },
  };
}
export function updateArtistMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ id, patch }: { id: string; patch: ArtistPatch }) => {
      const { data, error, response } = await apiClient.PATCH('/v1/studio/artists/{artist_id}', {
        params: { path: { artist_id: id } },
        body: patch,
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSuccess: (data: Artist, { id }: { id: string }) => {
      qc.setQueryData(studioKeys.artist(id), data);
      void qc.invalidateQueries({ queryKey: studioKeys.artists() });
    },
  };
}
export function deleteArtistMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (id: string) => {
      const { error, response } = await apiClient.DELETE('/v1/studio/artists/{artist_id}', {
        params: { path: { artist_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
    },
    onSuccess: (_: void, id: string) => {
      qc.removeQueries({ queryKey: studioKeys.artist(id) });
      void qc.invalidateQueries({ queryKey: studioKeys.artists() });
    },
  };
}
export function memoriesInfiniteQueryOptions(id: string, status: MemoryStatus) {
  return {
    queryKey: studioKeys.memories(id, status),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const { data, error, response } = await apiClient.GET(
        '/v1/studio/artists/{artist_id}/memories',
        { params: { path: { artist_id: id }, query: { status, limit: 30, cursor: pageParam } } },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    getNextPageParam: (
      page: components['schemas']['CursorPage_src.api.schemas.studio.MemoryOut_'],
    ) => page.next_cursor ?? undefined,
  };
}
function invalidateMemories(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: studioKeys.memories(id, 'active') });
  void qc.invalidateQueries({ queryKey: studioKeys.memories(id, 'archived') });
}
export function createMemoryMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ artistId, body }: { artistId: string; body: MemoryCreate }) => {
      const { data, error, response } = await apiClient.POST(
        '/v1/studio/artists/{artist_id}/memories',
        { params: { path: { artist_id: artistId } }, body },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSuccess: (_: unknown, { artistId }: { artistId: string }) => {
      void qc.invalidateQueries({ queryKey: studioKeys.memories(artistId, 'active') });
    },
  };
}
export function updateMemoryMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ id, patch }: { id: string; artistId: string; patch: MemoryPatch }) => {
      const { data, error, response } = await apiClient.PATCH('/v1/studio/memories/{memory_id}', {
        params: { path: { memory_id: id } },
        body: patch,
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSuccess: (_: unknown, { artistId }: { artistId: string }) => invalidateMemories(qc, artistId),
  };
}
export function deleteMemoryMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ id }: { id: string; artistId: string }) => {
      const { error, response } = await apiClient.DELETE('/v1/studio/memories/{memory_id}', {
        params: { path: { memory_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
    },
    onSuccess: (_: void, { artistId }: { artistId: string }) => invalidateMemories(qc, artistId),
  };
}
