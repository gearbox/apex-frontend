import { API_BASE_URL } from '$lib/utils/constants';

export type ProtectedContentSource = 'output' | 'upload';

declare const protectedContentBrand: unique symbol;

/**
 * A stable Apex content-proxy URL that has passed parseProtectedContentUrl(). The brand makes
 * fetchProtectedContent() unreachable with an unvalidated string.
 */
export interface ProtectedContentUrl {
  readonly url: string;
  readonly source: ProtectedContentSource;
  readonly [protectedContentBrand]: true;
}

const apiOrigin = new URL(API_BASE_URL).origin;

/**
 * Exactly one opaque identifier segment below the two content collections. The backend currently
 * uses UUIDs, but variants and fixtures use other safe slugs; the shape, not the ID format, is the
 * trust boundary here.
 */
const PROTECTED_CONTENT_PATH = /^\/v1\/content\/(outputs|uploads)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;

/** Anything a URL parser could normalize into a different request than the string suggests. */
const DISALLOWED_CHARACTERS = /[?#\\\s%@]/;

/**
 * Strict resolver for `MediaObject` URLs. Accepts a root-relative `/v1/content/{outputs|uploads}/{id}`
 * path, or the same path as an absolute URL on the configured API origin. Everything else —
 * foreign origins, protocol-relative URLs, embedded credentials, query strings, fragments, dot
 * segments, or any other API path — resolves to null and must never become a network request.
 */
export function parseProtectedContentUrl(value: string): ProtectedContentUrl | null {
  if (typeof value !== 'string' || value.length === 0 || DISALLOWED_CHARACTERS.test(value)) {
    return null;
  }

  let path: string;
  if (value.startsWith('/')) {
    if (value.startsWith('//')) return null;
    path = value;
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.origin !== apiOrigin || url.username || url.password) return null;
    // Must be the canonical spelling of that origin + path, so no normalization is hiding anything.
    if (value !== `${apiOrigin}${url.pathname}`) return null;
    path = url.pathname;
  }

  const match = PROTECTED_CONTENT_PATH.exec(path);
  // The raw path is matched (not a parsed/normalized one), so dot segments never match.
  if (!match) return null;

  return {
    url: `${apiOrigin}${path}`,
    source: match[1] === 'outputs' ? 'output' : 'upload',
  } as ProtectedContentUrl;
}

export interface FetchProtectedContentOptions {
  signal?: AbortSignal;
  cache?: RequestCache;
}

export interface ProbeProtectedContentOptions {
  signal?: AbortSignal;
}

function contentHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra };
  // Local dev serves every product from one API host; production resolves it from the origin.
  if (import.meta.env.DEV) headers['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
  return headers;
}

/**
 * The single request path for protected media bytes. It authenticates with the HttpOnly content
 * cookie only: the access token is deliberately never attached to a `/v1/content/...` GET.
 * Session isolation relies on `no-store` by default — callers keep bytes in memory, never in a
 * persistent browser or Cache Storage entry.
 */
export function fetchProtectedContent(
  target: ProtectedContentUrl,
  options: FetchProtectedContentOptions = {},
): Promise<Response> {
  return fetch(target.url, {
    headers: contentHeaders(),
    credentials: 'include',
    cache: options.cache ?? 'no-store',
    signal: options.signal,
  });
}

/**
 * Checks only whether the content cookie can access a validated media URL. The Range header is
 * intentionally owned here so callers cannot turn this credential probe into an arbitrary fetch
 * or a full-media download.
 */
export function probeProtectedContent(
  target: ProtectedContentUrl,
  options: ProbeProtectedContentOptions = {},
): Promise<Response> {
  return fetch(target.url, {
    headers: contentHeaders({ Range: 'bytes=0-0' }),
    credentials: 'include',
    cache: 'no-store',
    signal: options.signal,
  });
}
