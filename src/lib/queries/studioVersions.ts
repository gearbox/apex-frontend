import type { InfiniteData, QueryClient } from '@tanstack/svelte-query';
import apiClient from '$lib/api/client';
import { ApiRequestError, parseApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';
import { studioKeys, studioScopes } from './studio';
import { studioMutationKeys } from './studioTracks';

type VersionPage = components['schemas']['CursorPage_src.api.schemas.studio.VersionSummary_'];
type DocumentKind = 'plan' | 'lyrics';
export type ImportRequest = Omit<components['schemas']['SunoImportRequest'], 'dry_run'>;
type SetCurrentRequest = {
  plan?: string;
  lyrics?: string | null;
};

export function versionsInfiniteQueryOptions(trackId: string, kind: DocumentKind) {
  return {
    queryKey: studioKeys.versions(trackId, kind),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const { data, error, response } = await apiClient.GET(
        '/v1/studio/tracks/{track_id}/versions',
        {
          params: {
            path: { track_id: trackId },
            query: { kind, limit: 30, cursor: pageParam },
          },
        },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    getNextPageParam: (page: VersionPage) => page.next_cursor ?? undefined,
  };
}

export function versionQueryOptions(id: string) {
  return {
    queryKey: studioKeys.version(id),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/v1/studio/versions/{version_id}', {
        params: { path: { version_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    staleTime: Infinity,
  };
}

export function sunoExportQueryOptions(
  trackId: string,
  pair: { plan?: string; lyrics?: string } = {},
) {
  return {
    queryKey: studioKeys.sunoExport(trackId, pair),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/v1/studio/tracks/{track_id}/exports/suno',
        {
          params: {
            path: { track_id: trackId },
            query: {
              plan_version_id: pair.plan,
              lyrics_version_id: pair.lyrics,
            },
          },
        },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    staleTime: 0,
    gcTime: 60_000,
  };
}

/** An unscoped preview request; it has no cache side effects. */
export async function sunoImportPreview(trackId: string, request: ImportRequest) {
  const { data, error, response } = await apiClient.POST(
    '/v1/studio/tracks/{track_id}/imports/suno',
    {
      params: { path: { track_id: trackId } },
      body: { ...request, dry_run: true },
    },
  );
  if (error) throw new ApiRequestError(parseApiError(error, response.status));
  return data;
}

function reconcileTrackDocuments(qc: QueryClient, projectId: string, trackId: string): void {
  if (qc.isMutating({ mutationKey: studioMutationKeys.trackDocuments(trackId) }) > 1) return;
  void qc.invalidateQueries({ queryKey: studioKeys.track(trackId), exact: true });
  void qc.invalidateQueries({ queryKey: studioKeys.versions(trackId, 'plan') });
  void qc.invalidateQueries({ queryKey: studioKeys.versions(trackId, 'lyrics') });
  void qc.invalidateQueries({ queryKey: studioKeys.tracks(projectId) });
  void qc.invalidateQueries({ queryKey: [...studioKeys.track(trackId), 'suno-export'] });
}

export function sunoImportMutationOptions(qc: QueryClient, projectId: string, trackId: string) {
  return {
    mutationKey: studioMutationKeys.trackDocuments(trackId),
    scope: { id: studioScopes.track(trackId) },
    mutationFn: async (request: ImportRequest) => {
      const { data, error, response } = await apiClient.POST(
        '/v1/studio/tracks/{track_id}/imports/suno',
        {
          params: { path: { track_id: trackId } },
          body: { ...request, dry_run: false },
        },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSettled: () => reconcileTrackDocuments(qc, projectId, trackId),
  };
}

export function setCurrentMutationOptions(qc: QueryClient, projectId: string, trackId: string) {
  return {
    mutationKey: studioMutationKeys.trackDocuments(trackId),
    scope: { id: studioScopes.track(trackId) },
    mutationFn: async ({ plan, lyrics }: SetCurrentRequest) => {
      const body: components['schemas']['CurrentPut'] = {
        ...(plan !== undefined ? { plan_version_id: plan } : {}),
        ...(lyrics !== undefined ? { lyrics_version_id: lyrics } : {}),
      };
      const { data, error, response } = await apiClient.PUT(
        '/v1/studio/tracks/{track_id}/current',
        { params: { path: { track_id: trackId } }, body },
      );
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    onSettled: () => reconcileTrackDocuments(qc, projectId, trackId),
  };
}

function removeVersion(pages: InfiniteData<VersionPage> | undefined, id: string) {
  if (!pages) return pages;
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.filter((version) => version.id !== id),
    })),
  };
}

export function deleteVersionMutationOptions(qc: QueryClient, projectId: string, trackId: string) {
  return {
    mutationKey: studioMutationKeys.trackDocuments(trackId),
    scope: { id: studioScopes.track(trackId) },
    mutationFn: async ({ id }: { id: string }) => {
      const { error, response } = await apiClient.DELETE('/v1/studio/versions/{version_id}', {
        params: { path: { version_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
    },
    onSuccess: (_data: void, { id }: { id: string }) => {
      for (const kind of ['plan', 'lyrics'] as const) {
        qc.setQueryData<InfiniteData<VersionPage>>(studioKeys.versions(trackId, kind), (old) =>
          removeVersion(old, id),
        );
      }
      qc.removeQueries({ queryKey: studioKeys.version(id), exact: true });
    },
    onSettled: () => reconcileTrackDocuments(qc, projectId, trackId),
  };
}
