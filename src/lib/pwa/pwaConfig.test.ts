import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PWA registration configuration', () => {
  it('uses prompt lifecycle semantics rather than plugin auto-update', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("registerType: 'prompt'");
    expect(config).not.toContain("registerType: 'autoUpdate'");
  });
});
