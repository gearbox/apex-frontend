import { parseProtectedContentUrl } from './protectedContent';

/**
 * Resolves a `MediaObject` URL to its absolute stable content-proxy URL on the API origin.
 * Returns null for anything that is not an Apex protected-content URL (see
 * parseProtectedContentUrl); callers must render an unavailable state rather than request it.
 */
export function toMediaSrc(path: string): string | null {
  return parseProtectedContentUrl(path)?.url ?? null;
}
