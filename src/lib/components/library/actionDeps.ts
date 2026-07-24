import type { QueryClient } from '@tanstack/svelte-query';
import { libraryAssetQueryOptions } from '$lib/queries/library';
import type { components } from '$lib/api/types';
import type { LibraryActionDeps } from './actions';

type ProvidersResponse = components['schemas']['ProvidersResponse'];

/** Creates action collaborators without coupling the action resolver to TanStack Query. */
export function createLibraryActionDeps(
  getProviders: () => ProvidersResponse | undefined,
  queryClient: QueryClient,
): LibraryActionDeps {
  return {
    // This must remain a getter: providers can resolve after components create these deps.
    get providers() {
      return getProviders();
    },
    loadDetail: (assetRef) => queryClient.ensureQueryData(libraryAssetQueryOptions(assetRef)),
  };
}
