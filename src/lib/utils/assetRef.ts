import type { components } from '$lib/api/types';

type LibraryAssetSource = components['schemas']['LibraryAssetSource'];

export interface ParsedAssetRef {
  source: LibraryAssetSource;
  id: string;
}

const ASSET_SOURCES = ['upload', 'output'] as const satisfies readonly LibraryAssetSource[];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses a wire-format asset reference (`"upload:<uuid>"` / `"output:<uuid>"`). */
export function parseAssetRef(assetRef: string): ParsedAssetRef {
  const sep = assetRef.indexOf(':');
  const source = sep === -1 ? '' : assetRef.slice(0, sep);
  const id = sep === -1 ? '' : assetRef.slice(sep + 1);
  if (!(ASSET_SOURCES as readonly string[]).includes(source) || !UUID_RE.test(id)) {
    throw new Error(`Invalid asset reference: ${assetRef}`);
  }
  return { source: source as LibraryAssetSource, id };
}
