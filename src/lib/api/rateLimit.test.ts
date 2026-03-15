import { describe, it, expect } from 'vitest';
import { parseRateLimitHeaders, endpointKey, getRetryDelay } from './rateLimit';

/* ─── parseRateLimitHeaders ─── */

describe('parseRateLimitHeaders()', () => {
  function makeHeaders(init: Record<string, string>): Headers {
    return new Headers(init);
  }

  it('parses all four headers when present', () => {
    const result = parseRateLimitHeaders(
      makeHeaders({
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '7',
        'X-RateLimit-Reset': '1710345600',
        'Retry-After': '45',
      }),
    );

    expect(result).toEqual({ limit: 10, remaining: 7, reset: 1710345600, retryAfter: 45 });
  });

  it('omits missing headers', () => {
    const result = parseRateLimitHeaders(
      makeHeaders({ 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '3' }),
    );

    expect(result).toEqual({ limit: 10, remaining: 3 });
    expect('reset' in result).toBe(false);
    expect('retryAfter' in result).toBe(false);
  });

  it('omits non-numeric header values', () => {
    const result = parseRateLimitHeaders(
      makeHeaders({ 'X-RateLimit-Limit': 'not-a-number', 'X-RateLimit-Remaining': '5' }),
    );

    expect('limit' in result).toBe(false);
    expect(result.remaining).toBe(5);
  });

  it('returns empty object when no rate limit headers are present', () => {
    const result = parseRateLimitHeaders(new Headers({ 'Content-Type': 'application/json' }));
    expect(result).toEqual({});
  });

  it('handles Retry-After: 0 (immediate retry)', () => {
    const result = parseRateLimitHeaders(makeHeaders({ 'Retry-After': '0' }));
    expect(result).toEqual({ retryAfter: 0 });
  });
});

/* ─── endpointKey ─── */

describe('endpointKey()', () => {
  it('extracts pathname from a full URL', () => {
    expect(endpointKey('http://localhost:8000/v1/auth/login')).toBe('/v1/auth/login');
  });

  it('strips query string from a full URL', () => {
    expect(endpointKey('https://api.example.com/v1/jobs?page=2&limit=20')).toBe('/v1/jobs');
  });

  it('returns path as-is when already a pathname', () => {
    expect(endpointKey('/v1/auth/login')).toBe('/v1/auth/login');
  });

  it('strips query string from a bare path', () => {
    expect(endpointKey('/v1/gallery?cursor=abc')).toBe('/v1/gallery');
  });
});

/* ─── getRetryDelay ─── */

describe('getRetryDelay()', () => {
  it('uses Retry-After value (in ms) when provided', () => {
    expect(getRetryDelay(45, 1)).toBe(45_000);
    expect(getRetryDelay(45, 2)).toBe(45_000); // attempt irrelevant when retryAfter present
  });

  it('returns 0 ms when Retry-After is 0', () => {
    expect(getRetryDelay(0, 1)).toBe(0);
  });

  it('uses exponential backoff when Retry-After is absent', () => {
    expect(getRetryDelay(undefined, 1)).toBe(1_000); // 1s
    expect(getRetryDelay(undefined, 2)).toBe(2_000); // 2s
    expect(getRetryDelay(undefined, 3)).toBe(4_000); // 4s
  });

  it('caps exponential backoff at 30 s', () => {
    expect(getRetryDelay(undefined, 10)).toBe(30_000);
  });
});
