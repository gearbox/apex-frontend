import type { QueryClient } from '@tanstack/svelte-query';
import apiClient from '$lib/api/client';
import { ApiRequestError, parseApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';
import { studioKeys, studioScopes } from './studio';

type Track = components['schemas']['TrackOut'];
type TrackDetail = components['schemas']['TrackDetail'];
export const studioMutationKeys = {
  tracks: (projectId: string) => ['studio', 'mutation', 'tracks', projectId] as const,
};

/** Re-sort the current list by order, keeping unmentioned tracks at the end. */
export function applyOrder(current: Track[], order: readonly string[]): Track[] {
  const byId = new Map(current.map((track) => [track.id, track]));
  const seen = new Set<string>();
  const ordered = order.flatMap((id) => {
    const track = byId.get(id);
    if (!track || seen.has(id)) return [];
    seen.add(id);
    return [track];
  });
  return [...ordered, ...current.filter((track) => !seen.has(track.id))];
}

function reconcileTracks(qc: QueryClient, projectId: string) {
  if (qc.isMutating({ mutationKey: studioMutationKeys.tracks(projectId) }) <= 1)
    void qc.invalidateQueries({ queryKey: studioKeys.tracks(projectId) });
}

export function tracksQueryOptions(projectId: string) {
  return {
    queryKey: studioKeys.tracks(projectId),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/studio/projects/{project_id}/tracks',
        { params: { path: { project_id: projectId } } },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
  };
}
export function trackQueryOptions(id: string) {
  return {
    queryKey: studioKeys.track(id),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/v1/studio/tracks/{track_id}', {
        params: { path: { track_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
  };
}
function invalidateProject(qc: QueryClient, projectId: string) {
  void qc.invalidateQueries({ queryKey: studioKeys.project(projectId), exact: true });
  void qc.invalidateQueries({ queryKey: studioKeys.projects() });
}
export function createTrackMutationOptions(qc: QueryClient, projectId: string) {
  return {
    mutationKey: studioMutationKeys.tracks(projectId),
    scope: { id: studioScopes.tracks(projectId) },
    mutationFn: async ({ title }: { title: string }) => {
      const { data, error, response } = await apiClient.POST(
        '/v1/studio/projects/{project_id}/tracks',
        { params: { path: { project_id: projectId } }, body: { title } },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSuccess: (track: Track) => {
      qc.setQueryData<Track[]>(studioKeys.tracks(projectId), (old) =>
        old?.some((item) => item.id === track.id) ? old : [...(old ?? []), track],
      );
      invalidateProject(qc, projectId);
    },
    onSettled: () => reconcileTracks(qc, projectId),
  };
}
export function renameTrackMutationOptions(qc: QueryClient, projectId: string) {
  return {
    mutationKey: studioMutationKeys.tracks(projectId),
    scope: { id: studioScopes.tracks(projectId) },
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { data, error, response } = await apiClient.PATCH('/v1/studio/tracks/{track_id}', {
        params: { path: { track_id: id } },
        body: { title },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSuccess: (track: Track, { id }: { id: string; title: string }) => {
      qc.setQueryData<Track[]>(studioKeys.tracks(projectId), (old) =>
        old?.map((item) => (item.id === id ? { ...item, ...track } : item)),
      );
      qc.setQueryData<TrackDetail>(studioKeys.track(id), (old) =>
        old ? { ...old, ...track } : undefined,
      );
    },
    onSettled: () => reconcileTracks(qc, projectId),
  };
}
export function deleteTrackMutationOptions(qc: QueryClient, projectId: string) {
  return {
    mutationKey: studioMutationKeys.tracks(projectId),
    scope: { id: studioScopes.tracks(projectId) },
    mutationFn: async ({ id }: { id: string }) => {
      const { error, response } = await apiClient.DELETE('/v1/studio/tracks/{track_id}', {
        params: { path: { track_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
    },
    onSuccess: (_data: void, { id }: { id: string }) => {
      qc.setQueryData<Track[]>(studioKeys.tracks(projectId), (old) =>
        old?.filter((item) => item.id !== id),
      );
      qc.removeQueries({ queryKey: studioKeys.track(id) });
      invalidateProject(qc, projectId);
    },
    onSettled: () => reconcileTracks(qc, projectId),
  };
}
export function reorderTracksMutationOptions(qc: QueryClient, projectId: string) {
  return {
    mutationKey: studioMutationKeys.tracks(projectId),
    scope: { id: studioScopes.tracks(projectId) },
    mutationFn: async ({ trackIds }: { trackIds: string[] }) => {
      const { data, error, response } = await apiClient.PUT(
        '/v1/studio/projects/{project_id}/tracks/order',
        { params: { path: { project_id: projectId } }, body: { track_ids: trackIds } },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onMutate: async ({ trackIds }: { trackIds: string[] }) => {
      await qc.cancelQueries({ queryKey: studioKeys.tracks(projectId) });
      const previous = qc.getQueryData<Track[]>(studioKeys.tracks(projectId));
      if (previous) {
        qc.setQueryData(studioKeys.tracks(projectId), applyOrder(previous, trackIds));
      }
      return { previousOrder: previous?.map((track) => track.id) };
    },
    onError: (
      error: unknown,
      _variables: { trackIds: string[] },
      context: { previousOrder?: string[] } | undefined,
    ) => {
      const current = qc.getQueryData<Track[]>(studioKeys.tracks(projectId));
      if (current && context?.previousOrder)
        qc.setQueryData(studioKeys.tracks(projectId), applyOrder(current, context.previousOrder));
      if (error instanceof ApiRequestError && error.error === 'track_order_mismatch')
        void qc.invalidateQueries({ queryKey: studioKeys.tracks(projectId) });
    },
    onSuccess: (tracks: Track[]) => {
      const positions = new Map(tracks.map((track) => [track.id, track.position]));
      qc.setQueryData<Track[]>(studioKeys.tracks(projectId), (current) => {
        if (!current) return current;
        const positioned = current.map((track) => ({
          ...track,
          position: positions.get(track.id) ?? track.position,
        }));
        return applyOrder(
          positioned,
          tracks.map((track) => track.id),
        );
      });
    },
    onSettled: () => reconcileTracks(qc, projectId),
  };
}
