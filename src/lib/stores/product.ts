import { writable, derived } from 'svelte/store';
import type { components } from '$lib/api/types';

export type ProductInfo = components['schemas']['ProductInfoResponse'];

export const productInfo = writable<ProductInfo | null>(null);

/** The build manifest brand is available before the product-info request settles. */
export const appDisplayName = derived(
  productInfo,
  ($info) => $info?.display_name ?? __PRODUCT_NAME__,
);

export const isNsfwAllowed = derived(productInfo, ($p) => $p?.content_rating === 'permissive');
