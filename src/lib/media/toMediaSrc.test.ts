import { describe, it, expect } from 'vitest';
import { toMediaSrc } from './toMediaSrc';

const ORIGIN = 'http://localhost:8000';

describe('toMediaSrc', () => {
  it('prefixes root-relative content paths with the API origin', () => {
    expect(toMediaSrc('/v1/content/outputs/abc')).toBe(`${ORIGIN}/v1/content/outputs/abc`);
    expect(toMediaSrc('/v1/content/uploads/abc')).toBe(`${ORIGIN}/v1/content/uploads/abc`);
  });

  it('keeps a same-API-origin absolute content URL', () => {
    expect(toMediaSrc(`${ORIGIN}/v1/content/outputs/abc`)).toBe(`${ORIGIN}/v1/content/outputs/abc`);
  });

  it.each([
    'http://cdn.example.com/image.jpg',
    'https://cdn.example.com/image.jpg',
    'https://bucket.r2.cloudflarestorage.com/out.png?X-Amz-Signature=abc',
    '//cdn.example.com/v1/content/outputs/abc',
    '/v1/users/me',
    '/v1/content/outputs/abc?download=1',
  ])('no longer passes %s through as protected media', (value) => {
    expect(toMediaSrc(value)).toBeNull();
  });
});
