import { describe, it, expect } from 'vitest';
import { parseAssetRef } from './assetRef';

describe('parseAssetRef()', () => {
  it('round-trips a valid upload ref', () => {
    expect(parseAssetRef('upload:550e8400-e29b-41d4-a716-446655440000')).toEqual({
      source: 'upload',
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('round-trips a valid output ref', () => {
    expect(parseAssetRef('output:550e8400-e29b-41d4-a716-446655440000')).toEqual({
      source: 'output',
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('accepts an uppercase UUID', () => {
    expect(parseAssetRef('output:550E8400-E29B-41D4-A716-446655440000')).toEqual({
      source: 'output',
      id: '550E8400-E29B-41D4-A716-446655440000',
    });
  });

  it('throws when the colon separator is missing', () => {
    expect(() => parseAssetRef('output-550e8400-e29b-41d4-a716-446655440000')).toThrow(
      'Invalid asset reference',
    );
  });

  it('throws for an unknown source', () => {
    expect(() => parseAssetRef('asset:550e8400-e29b-41d4-a716-446655440000')).toThrow(
      'Invalid asset reference',
    );
  });

  it('throws for a non-UUID id', () => {
    expect(() => parseAssetRef('upload:not-a-uuid')).toThrow('Invalid asset reference');
  });

  it('throws for an empty source segment', () => {
    expect(() => parseAssetRef(':550e8400-e29b-41d4-a716-446655440000')).toThrow(
      'Invalid asset reference',
    );
  });

  it('throws for an empty id segment', () => {
    expect(() => parseAssetRef('upload:')).toThrow('Invalid asset reference');
  });

  it('preserves a trailing segment containing extra colons instead of truncating it', () => {
    // Guards against `split(':', 2)`, which would silently drop everything after the 2nd colon.
    expect(() => parseAssetRef('upload:550e8400-e29b-41d4-a716-446655440000:extra')).toThrow(
      'Invalid asset reference',
    );
  });
});
