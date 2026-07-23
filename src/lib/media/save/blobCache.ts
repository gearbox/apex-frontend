const TTL_MS = 60_000;

interface CacheEntry {
  url: string;
  blob: Blob;
  storedAt: number;
}

let entry: CacheEntry | null = null;

/** Single-entry, TTL-bounded cache so a retried share after activation expiry skips the network. */
export function get(url: string, now: number): Blob | null {
  if (!entry || entry.url !== url || now - entry.storedAt >= TTL_MS) return null;
  return entry.blob;
}

export function set(url: string, blob: Blob, now: number): void {
  entry = { url, blob, storedAt: now };
}

/** Bounds memory to one asset at a time — videos can be large. */
export function clear(): void {
  entry = null;
}
