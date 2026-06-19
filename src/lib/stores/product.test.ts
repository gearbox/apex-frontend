import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { productInfo, isNsfwAllowed, type ProductInfo } from './product';

const vexProduct: ProductInfo = {
  product: 'vex',
  display_name: 'vex.pics',
  age_gate: 'checkbox',
  allowed_auth_methods: ['email_password'],
  content_rating: 'permissive',
  payment_providers: ['stripe', 'nowpayments'],
};

const syntharaProduct: ProductInfo = {
  product: 'synthara',
  display_name: 'Synthara',
  age_gate: 'none',
  allowed_auth_methods: ['email_password'],
  content_rating: 'sfw',
  payment_providers: ['stripe'],
};

beforeEach(() => {
  productInfo.set(null);
});

describe('productInfo', () => {
  it('starts as null', () => {
    expect(get(productInfo)).toBeNull();
  });

  it('can be set and read back', () => {
    productInfo.set(vexProduct);
    expect(get(productInfo)).toEqual(vexProduct);
  });

  it('can be updated', () => {
    productInfo.set(vexProduct);
    productInfo.set(syntharaProduct);
    expect(get(productInfo)?.product).toBe('synthara');
  });

  it('can be reset to null', () => {
    productInfo.set(vexProduct);
    productInfo.set(null);
    expect(get(productInfo)).toBeNull();
  });
});

describe('isNsfwAllowed', () => {
  it('is false when productInfo is null', () => {
    expect(get(isNsfwAllowed)).toBe(false);
  });

  it('is true for permissive content rating (vex)', () => {
    productInfo.set(vexProduct);
    expect(get(isNsfwAllowed)).toBe(true);
  });

  it('is false for sfw content rating (synthara)', () => {
    productInfo.set(syntharaProduct);
    expect(get(isNsfwAllowed)).toBe(false);
  });

  it('updates reactively when productInfo changes', () => {
    productInfo.set(vexProduct);
    expect(get(isNsfwAllowed)).toBe(true);
    productInfo.set(syntharaProduct);
    expect(get(isNsfwAllowed)).toBe(false);
  });
});
