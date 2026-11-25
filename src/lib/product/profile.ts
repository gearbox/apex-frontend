import { derived } from 'svelte/store';
import { productInfo } from '$lib/stores/product';
import { BUILD_PRODUCT_ID } from './build';
import { parseProductId, type ProductId } from './ids';
import { PRODUCT_PROFILES, type ProductProfile } from './profiles';

const reportedUnknown = new Set<string>();
export function resolveProductProfile(
  raw: string | undefined,
  fallback: ProductId = BUILD_PRODUCT_ID,
): ProductProfile {
  if (raw === undefined) return PRODUCT_PROFILES[fallback];
  const id = parseProductId(raw);
  if (id !== null) return PRODUCT_PROFILES[id];
  if (!reportedUnknown.has(raw)) {
    reportedUnknown.add(raw);
    console.error('product.profile.unknown', { product: raw });
  }
  return PRODUCT_PROFILES[fallback];
}
export const productProfile = derived(productInfo, ($info) =>
  resolveProductProfile($info?.product),
);

let reportedMismatch = false;
export function checkBuildProduct(runtimeId: string | undefined): void {
  const runtime = parseProductId(runtimeId);
  if (runtime !== null && runtime !== BUILD_PRODUCT_ID && !reportedMismatch) {
    reportedMismatch = true;
    console.error('product.build_mismatch', { build: BUILD_PRODUCT_ID, runtime });
  }
}
