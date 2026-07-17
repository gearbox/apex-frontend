import { get } from 'svelte/store';
import { getCurrentUser, type UserProfile } from '$lib/stores/auth';
import { productInfo, type ProductInfo } from '$lib/stores/product';

/**
 * Storage used by a payment must use the same stable product identity in every
 * tab. The host is deliberately not a fallback: it can differ from the
 * product slug and would split one checkout between two storage namespaces.
 */
export interface PaymentStorageScope {
  userId: string;
  product: string;
}

function configuredProductId(): string | null {
  const configured = import.meta.env.VITE_PRODUCT_ID?.trim();
  return configured || null;
}

export function getPaymentStorageScope(
  user: UserProfile | null = getCurrentUser(),
  loadedProduct: ProductInfo | null = get(productInfo),
): PaymentStorageScope | null {
  if (!user?.id) return null;

  // A baked VITE selector is useful in local development only. Production
  // storage must follow the product returned by the authenticated runtime.
  const product = import.meta.env.DEV
    ? (configuredProductId() ?? loadedProduct?.product?.trim() ?? null)
    : (loadedProduct?.product?.trim() ?? null);
  return product ? { userId: user.id, product } : null;
}
