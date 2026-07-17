import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPaymentStorageScope } from './paymentScope';
import type { UserProfile } from '$lib/stores/auth';
import type { ProductInfo } from '$lib/stores/product';

const user = { id: 'user-a' } as UserProfile;
const product = { product: 'runtime-product' } as ProductInfo;

afterEach(() => vi.unstubAllEnvs());

describe('getPaymentStorageScope()', () => {
  it('returns null until both a user and a stable product are available', () => {
    expect(getPaymentStorageScope(null, product)).toBeNull();
    expect(getPaymentStorageScope(user, null)).toBeNull();
  });

  it('uses a VITE product selector only during development', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PRODUCT_ID', 'local-product');
    expect(getPaymentStorageScope(user, product)).toEqual({
      userId: 'user-a',
      product: 'local-product',
    });
  });

  it('uses the loaded runtime product in production even with a baked selector', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_PRODUCT_ID', 'local-product');
    expect(getPaymentStorageScope(user, product)).toEqual({
      userId: 'user-a',
      product: 'runtime-product',
    });
  });
});
