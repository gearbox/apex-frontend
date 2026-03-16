import { writable, derived } from 'svelte/store';
import type { components } from '$lib/api/types';

export type ProductInfo = components['schemas']['ProductInfoResponse'];

export const productInfo = writable<ProductInfo | null>(null);

export const isNsfwAllowed = derived(productInfo, ($p) => $p?.content_rating === 'permissive');

export const requiresAgeGate = derived(
  productInfo,
  ($p) => $p !== null && $p.age_gate !== 'none',
);
