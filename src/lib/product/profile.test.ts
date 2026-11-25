import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { productInfo } from '$lib/stores/product';
import { BUILD_PRODUCT_ID } from './build';
import { productProfile, resolveProductProfile } from './profile';

afterEach(() => {
  productInfo.set(null);
  vi.restoreAllMocks();
});
describe('product profile resolution', () => {
  it('uses the fallback and reports each unknown product once', async () => {
    vi.resetModules();
    const { resolveProductProfile: resolve } = await import('./profile');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolve(undefined, 'synthara').id).toBe('synthara');
    expect(resolve('vex', 'synthara').id).toBe('vex');
    expect(resolve('acme', 'vex').id).toBe('vex');
    expect(resolve('acme', 'vex').id).toBe('vex');
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('product.profile.unknown', { product: 'acme' });
  });
  it('reports a build mismatch once and ignores matches and unknown IDs', async () => {
    vi.resetModules();
    const { checkBuildProduct } = await import('./profile');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkBuildProduct(BUILD_PRODUCT_ID);
    checkBuildProduct('unknown');
    const other = BUILD_PRODUCT_ID === 'vex' ? 'synthara' : 'vex';
    checkBuildProduct(other);
    checkBuildProduct(other);
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('product.build_mismatch', {
      build: BUILD_PRODUCT_ID,
      runtime: other,
    });
  });
  it('follows runtime product info and defaults to the build', () => {
    productInfo.set(null);
    expect(get(productProfile).id).toBe(BUILD_PRODUCT_ID);
    productInfo.set({
      product: 'synthara',
      display_name: 'Synthara',
      age_gate: 'none',
      allowed_auth_methods: ['email_password'],
      content_rating: 'sfw',
      payment_providers: ['stripe'],
    });
    expect(get(productProfile)).toEqual(resolveProductProfile('synthara'));
  });
});
