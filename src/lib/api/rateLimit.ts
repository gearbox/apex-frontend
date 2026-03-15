export interface RateLimitHeaders {
  limit?: number;
  remaining?: number;
  reset?: number; // UTC epoch seconds
  retryAfter?: number; // seconds (only on 429)
}

/**
 * Parse rate limit headers from a Response into typed values.
 * Non-numeric or missing headers are omitted from the result.
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitHeaders {
  const result: RateLimitHeaders = {};

  const parse = (raw: string | null): number | undefined => {
    if (raw === null) return undefined;
    const n = parseInt(raw, 10);
    return isNaN(n) ? undefined : n;
  };

  const limit = parse(headers.get('X-RateLimit-Limit'));
  const remaining = parse(headers.get('X-RateLimit-Remaining'));
  const reset = parse(headers.get('X-RateLimit-Reset'));
  const retryAfter = parse(headers.get('Retry-After'));

  if (limit !== undefined) result.limit = limit;
  if (remaining !== undefined) result.remaining = remaining;
  if (reset !== undefined) result.reset = reset;
  if (retryAfter !== undefined) result.retryAfter = retryAfter;

  return result;
}

/**
 * Normalize a URL or path to a pathname-only key (strips origin and query string).
 */
export function endpointKey(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    const idx = url.indexOf('?');
    return idx >= 0 ? url.slice(0, idx) : url;
  }
}

/**
 * Calculate the delay in milliseconds before a retry.
 * If Retry-After is provided it takes precedence; otherwise exponential backoff is used.
 * @param retryAfter - value from Retry-After header (seconds)
 * @param attempt    - 1-based retry attempt number
 */
export function getRetryDelay(retryAfter: number | undefined, attempt: number): number {
  if (retryAfter !== undefined) {
    return Math.max(0, retryAfter) * 1000;
  }
  // Exponential backoff: 1 s → 2 s → 4 s → … capped at 30 s
  return Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
}
