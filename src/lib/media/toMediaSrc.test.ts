import { describe, it, expect } from 'vitest';
import { toMediaSrc } from './toMediaSrc';

const ORIGIN = 'http://localhost:8000';

describe('toMediaSrc', () => {
  it('prefixes root-relative paths with the API origin', () => {
    expect(toMediaSrc('/v1/content/outputs/abc')).toBe(`${ORIGIN}/v1/content/outputs/abc`);
  });

  it('returns absolute http URLs unchanged', () => {
    const abs = 'http://cdn.example.com/image.jpg';
    expect(toMediaSrc(abs)).toBe(abs);
  });

  it('returns absolute https URLs unchanged', () => {
    const abs = 'https://cdn.example.com/image.jpg';
    expect(toMediaSrc(abs)).toBe(abs);
  });
});
