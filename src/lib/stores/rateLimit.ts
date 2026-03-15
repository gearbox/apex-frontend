import { writable, derived, get } from 'svelte/store';
import type { RateLimitHeaders } from '$lib/api/rateLimit';

export type RateLimitState = RateLimitHeaders;

const rateLimitMap = writable<Record<string, RateLimitState>>({});

/**
 * Merge new rate limit header values into the store entry for the given endpoint key.
 */
export function updateRateLimit(key: string, info: RateLimitHeaders): void {
  rateLimitMap.update((map) => ({
    ...map,
    [key]: { ...map[key], ...info },
  }));
}

/**
 * Returns a derived store that reactively exposes the rate limit state for one endpoint.
 */
export function rateLimitFor(key: string) {
  return derived(rateLimitMap, ($map) => $map[key] as RateLimitState | undefined);
}

/**
 * Synchronous snapshot of the current rate limit state for an endpoint.
 */
export function getRateLimitState(key: string): RateLimitState | undefined {
  return get(rateLimitMap)[key];
}

/** Reset all stored rate limit state (useful in tests). */
export function clearRateLimits(): void {
  rateLimitMap.set({});
}
