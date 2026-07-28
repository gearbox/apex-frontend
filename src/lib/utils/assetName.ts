import type { components } from '$lib/api/types';

type LibraryAssetItem = components['schemas']['LibraryAssetItem'];
type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];

/** Either shape — both carry display_title / display_filename / original_filename. */
type NamedAsset = Pick<
  LibraryAssetItem | LibraryAssetDetail,
  'display_title' | 'display_filename' | 'original_filename'
>;

/**
 * Backend writes `original_filename` as a canonical `{uuid}.{ext}` system
 * identifier. It is never a name a human chose, so it must never be rendered.
 */
const CANONICAL_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i;

/**
 * The human-readable filename, or `null` if there isn't one.
 *
 * Mirrors the backend's `COALESCE(display_filename, original_filename)` search
 * predicate so rendered names and search results agree: `display_filename` is
 * the sanitized client name on uploads written since the backend release;
 * uploads predating it have it `null` but still hold a real name in
 * `original_filename`. Canonical `{uuid}.{ext}` values resolve to `null` —
 * frame extractions and filename-less uploads have no human name to show.
 */
export function assetFilename(asset: NamedAsset): string | null {
  if (asset.display_filename) return asset.display_filename;
  const original = asset.original_filename;
  if (!original || CANONICAL_FILENAME_RE.test(original)) return null;
  return original;
}

/** The name to show for an asset: user-set title, else filename, else `fallback`. */
export function assetLabel(asset: NamedAsset, fallback: string): string {
  return asset.display_title ?? assetFilename(asset) ?? fallback;
}
