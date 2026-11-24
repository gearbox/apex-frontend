import type { QueryClient } from '@tanstack/svelte-query';
import apiClient from '$lib/api/client';
import { ApiRequestError, parseApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';
import { projectKeys } from './library';
import { studioKeys } from './studio';

type Profile = components['schemas']['ProjectProfileOut'];
type ProfilePut = components['schemas']['ProjectProfilePut'];
type Page = components['schemas']['CursorPage_src.api.schemas.studio.ProjectProfileOut_'];
type LibraryProject = components['schemas']['LibraryProject'];

export class StudioProjectSetupError extends Error {
  constructor(
    readonly libraryProjectId: string,
    cause: unknown,
  ) {
    super("The project was created but Studio couldn't be set up. Try again.", { cause });
    this.name = 'StudioProjectSetupError';
  }
}

export function projectsInfiniteQueryOptions() {
  return {
    queryKey: studioKeys.projects(),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const { data, error, response } = await apiClient.GET('/v1/studio/projects', {
        params: { query: { limit: 30, cursor: pageParam } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
    getNextPageParam: (page: Page) => page.next_cursor ?? undefined,
  };
}
export function projectQueryOptions(id: string) {
  return {
    queryKey: studioKeys.project(id),
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/v1/studio/projects/{project_id}', {
        params: { path: { project_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data;
    },
  };
}
async function putProfile(id: string, profile: ProfilePut) {
  const { data, error, response } = await apiClient.PUT('/v1/studio/projects/{project_id}', {
    params: { path: { project_id: id } },
    body: profile,
  });
  if (error) throw new ApiRequestError(parseApiError(error, response.status));
  return data;
}
export function createStudioProjectMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({
      name,
      profile,
      existingLibraryProjectId,
      previousName,
    }: {
      name: string;
      profile: ProfilePut;
      existingLibraryProjectId?: string;
      previousName?: string;
    }) => {
      let id = existingLibraryProjectId;
      if (!id) {
        const { data, error, response } = await apiClient.POST('/v1/library/projects', {
          body: { name },
        });
        if (error) throw new ApiRequestError(parseApiError(error, response.status));
        id = (data as LibraryProject).id;
      } else if (previousName !== undefined && previousName !== name) {
        const { error, response } = await apiClient.PATCH('/v1/library/projects/{project_id}', {
          params: { path: { project_id: id } },
          body: { name },
        });
        if (error) throw new ApiRequestError(parseApiError(error, response.status));
      }
      try {
        return await putProfile(id, profile);
      } catch (error) {
        throw new StudioProjectSetupError(id, error);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: studioKeys.projects() });
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  };
}
export function updateProjectProfileMutationOptions(qc: QueryClient) {
  return {
    mutationFn: ({ id, profile }: { id: string; profile: ProfilePut }) => putProfile(id, profile),
    onSuccess: (data: Profile, { id }: { id: string }) => {
      qc.setQueryData(studioKeys.project(id), data);
      void qc.invalidateQueries({ queryKey: studioKeys.projects() });
    },
  };
}
export function renameStudioProjectMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error, response } = await apiClient.PATCH('/v1/library/projects/{project_id}', {
        params: { path: { project_id: id } },
        body: { name },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
      return data as LibraryProject;
    },
    onSuccess: (_data: LibraryProject, { id }: { id: string }) => {
      void qc.invalidateQueries({ queryKey: studioKeys.project(id) });
      void qc.invalidateQueries({ queryKey: studioKeys.projects() });
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  };
}
export function disableStudioProjectMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (id: string) => {
      const { error, response } = await apiClient.DELETE('/v1/studio/projects/{project_id}', {
        params: { path: { project_id: id } },
      });
      if (error) throw new ApiRequestError(parseApiError(error, response.status));
    },
    onSuccess: (_data: void, id: string) => {
      qc.removeQueries({ queryKey: studioKeys.project(id) });
      void qc.invalidateQueries({ queryKey: studioKeys.projects() });
    },
  };
}
