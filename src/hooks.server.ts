import type { Handle } from '@sveltejs/kit';
import { PRODUCT_HTML_TOKENS } from '$lib/product/htmlTokens';

export const handle: Handle = ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) =>
      Object.entries(PRODUCT_HTML_TOKENS).reduce(
        (out, [token, value]) => out.replaceAll(token, value),
        html,
      ),
  });
