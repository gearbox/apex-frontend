import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { escapeHtmlAttribute, PRODUCT_HTML_TOKENS } from './htmlTokens';

describe('product HTML tokens', () => {
  it('escapes values for attributes', () => {
    expect(escapeHtmlAttribute(`&"'< >`)).toBe('&amp;&quot;&#39;&lt; &gt;');
  });
  it('provides every token in the app template', () => {
    const html = readFileSync('src/app.html', 'utf8');
    for (const token of html.match(/%apex\.[a-z_.]+%/g) ?? []) {
      expect(PRODUCT_HTML_TOKENS[token]).toBeTruthy();
    }
    expect(html).toMatch(/%apex\./);
  });
});
