export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll("'", '&#39;');
}

export const PRODUCT_HTML_TOKENS: Record<string, string> = {
  '%apex.product.short_name%': escapeHtmlAttribute(__PRODUCT_SHORT_NAME__),
  '%apex.product.theme_color%': escapeHtmlAttribute(__PRODUCT_THEME_COLOR__),
};
