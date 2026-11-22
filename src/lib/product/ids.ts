export const PRODUCT_IDS = ['vex', 'synthara'] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export function parseProductId(raw: string | null | undefined): ProductId | null {
  const value = raw?.trim();
  return value && (PRODUCT_IDS as readonly string[]).includes(value) ? (value as ProductId) : null;
}
