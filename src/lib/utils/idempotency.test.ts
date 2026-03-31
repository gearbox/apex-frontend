import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey } from './idempotency';

describe('generateIdempotencyKey()', () => {
  it('returns a valid UUIDv4 string', () => {
    const key = generateIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is at most 64 characters (backend limit)', () => {
    const key = generateIdempotencyKey();
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it('returns a unique key on each call', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateIdempotencyKey()));
    expect(keys.size).toBe(100);
  });
});
