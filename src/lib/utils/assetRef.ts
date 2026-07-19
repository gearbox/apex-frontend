import type { components } from '$lib/api/types';

type LibraryAssetSource = components['schemas']['LibraryAssetSource'];

export interface ParsedAssetRef {
  source: LibraryAssetSource;
  id: string;
}

/** Parses a wire-format asset reference (`"upload:<uuid>"` / `"output:<uuid>"`). */
export function parseAssetRef(assetRef: string): ParsedAssetRef {
  const [source, id] = assetRef.split(':', 2);
  return { source: source as LibraryAssetSource, id };
}
