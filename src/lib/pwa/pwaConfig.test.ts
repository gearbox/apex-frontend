import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PWA registration configuration', () => {
  it('uses prompt lifecycle semantics rather than plugin auto-update', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("registerType: 'prompt'");
    expect(config).not.toContain("registerType: 'autoUpdate'");
  });

  it('restricts the precache source to public SvelteKit output', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("'client/**/*.{js,css,svg,png,woff2}'");
    expect(config).toContain("'prerendered/pages/**/*.html'");
    expect(config).toContain("'server/**'");
    expect(config).toContain("'client/pwa-lifecycle-fixture/**'");
    expect(config).not.toContain("globPatterns: ['**/*");
  });
});
