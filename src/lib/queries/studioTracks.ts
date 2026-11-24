import type { QueryClient } from '@tanstack/svelte-query';
import apiClient from '$lib/api/client';
import { ApiRequestError, parseApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';
import { studioKeys } from './studio';

type Track = components['schemas']['TrackOut'];
type TrackDetail = components['schemas']['TrackDetail'];
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
export function createTrackMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ projectId, title }: { projectId: string; title: string }) => {
      const { data, error, response } = await apiClient.POST(
        '/v1/studio/projects/{project_id}/tracks',
        { params: { path: { project_id: projectId } }, body: { title } },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSuccess: (track: Track, { projectId }: { projectId: string }) => {
      qc.setQueryData<Track[]>(studioKeys.tracks(projectId), (old) =>
        old ? [...old, track] : [track],
      );
      invalidateProject(qc, projectId);
    },
  };
}
export function renameTrackMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ id, title }: { projectId: string; id: string; title: string }) => {
      const { data, error, response } = await apiClient.PATCH('/v1/studio/tracks/{track_id}', {
        params: { path: { track_id: id } },
        body: { title },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSuccess: (track: Track, { projectId, id }: { projectId: string; id: string }) => {
      qc.setQueryData<Track[]>(studioKeys.tracks(projectId), (old) =>
        old?.map((item) => (item.id === id ? track : item)),
      );
      qc.setQueryData<TrackDetail>(studioKeys.track(id), (old) =>
        old ? { ...old, ...track } : undefined,
      );
    },
  };
}
export function deleteTrackMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ id }: { projectId: string; id: string }) => {
      const { error, response } = await apiClient.DELETE('/v1/studio/tracks/{track_id}', {
        params: { path: { track_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
    },
    onSuccess: (_data: void, { projectId, id }: { projectId: string; id: string }) => {
      qc.setQueryData<Track[]>(studioKeys.tracks(projectId), (old) =>
        old?.filter((item) => item.id !== id),
      );
      qc.removeQueries({ queryKey: studioKeys.track(id) });
      invalidateProject(qc, projectId);
    },
  };
}
export function reorderTracksMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ projectId, trackIds }: { projectId: string; trackIds: string[] }) => {
      const { data, error, response } = await apiClient.PUT(
        '/v1/studio/projects/{project_id}/tracks/order',
        { params: { path: { project_id: projectId } }, body: { track_ids: trackIds } },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onMutate: async ({ projectId, trackIds }: { projectId: string; trackIds: string[] }) => {
      await qc.cancelQueries({ queryKey: studioKeys.tracks(projectId) });
      const previous = qc.getQueryData<Track[]>(studioKeys.tracks(projectId));
      if (previous) {
        const byId = new Map(previous.map((track) => [track.id, track]));
        const reordered = trackIds
          .map((id) => byId.get(id))
          .filter((item): item is Track => !!item);
        if (reordered.length === previous.length)
          qc.setQueryData(studioKeys.tracks(projectId), reordered);
      }
      return { previous };
    },
    onError: (
      _error: unknown,
      { projectId }: { projectId: string },
      context: { previous?: Track[] } | undefined,
    ) => {
      if (context?.previous) qc.setQueryData(studioKeys.tracks(projectId), context.previous);
      void qc.invalidateQueries({ queryKey: studioKeys.tracks(projectId) });
    },
    onSuccess: (tracks: Track[], { projectId }: { projectId: string }) =>
      qc.setQueryData(studioKeys.tracks(projectId), tracks),
  };
}
