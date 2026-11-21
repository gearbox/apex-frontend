import { parseProductId, type ProductId } from './ids';

const parsed = parseProductId(__PRODUCT_ID__);
if (parsed === null) {
  throw new Error(`Build product "${__PRODUCT_ID__}" is not a known ProductId.`);
}
export const BUILD_PRODUCT_ID: ProductId = parsed;
