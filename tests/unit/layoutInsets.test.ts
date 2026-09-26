import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legalLayout = readFileSync('src/routes/(legal)/+layout.svelte', 'utf8');
const authLayout = readFileSync('src/routes/(auth)/+layout.svelte', 'utf8');

describe('safe-area layout convention', () => {
  it('reads insets through shared CSS variables and keeps legal content scrollable', () => {
    for (const source of [legalLayout, authLayout]) {
      expect(source).not.toContain('env(safe-area-inset-');
    }
    expect(legalLayout).toContain('overflow-y: auto');
  });
});
