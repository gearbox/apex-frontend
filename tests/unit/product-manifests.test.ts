import { describe, expect, it } from 'vitest';
import { PRODUCT_MANIFESTS, resolveBuildProduct } from '../../product-manifests.js';
import { PRODUCT_IDS } from '../../src/lib/product/ids';

describe('build product manifest', () => {
  it('resolves defaults and trimmed IDs and rejects unknown IDs', () => {
    expect(resolveBuildProduct(undefined).id).toBe('vex');
    expect(resolveBuildProduct('').id).toBe('vex');
    expect(resolveBuildProduct(' synthara ').id).toBe('synthara');
    expect(() => resolveBuildProduct('acme')).toThrow('Expected one of: vex, synthara');
  });
  it('has the same IDs as runtime products', () => {
    expect(Object.keys(PRODUCT_MANIFESTS).sort()).toEqual([...PRODUCT_IDS].sort());
  });
});
