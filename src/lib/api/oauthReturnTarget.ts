import { safeReturnPath } from '$lib/utils/returnPath';

const STORAGE_KEY = 'apex:oauth:return-to';

/**
 * Remembers the safe destination for one OAuth attempt in this browser tab. The callback error
 * fragment intentionally has no `return_to`, so this is the only retry source for expired and
 * cancelled flows.
 */
export function save(path: string | null): void {
  try {
    const returnTo = safeReturnPath(path);
    if (returnTo) {
      sessionStorage.setItem(STORAGE_KEY, returnTo);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // sessionStorage is optional; OAuth can still start without a remembered destination.
  }
}

export function load(): string | null {
  try {
    return safeReturnPath(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clear(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage is optional; the server-side OAuth transaction remains authoritative.
  }
}
