/** @vitest-environment node */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_MANIFESTS,
  resolveBuildProduct,
  resolveBuildProductForMode,
} from '../../product-manifests.js';
import { PRODUCT_IDS } from '../../src/lib/product/ids';

describe('build product manifest', () => {
  it('resolves defaults and trimmed IDs and rejects unknown IDs', () => {
    expect(resolveBuildProduct(undefined).id).toBe('vex');
    expect(resolveBuildProduct('').id).toBe('vex');
    expect(resolveBuildProduct(' synthara ').id).toBe('synthara');
    expect(() => resolveBuildProduct('acme')).toThrow('Expected one of: vex, synthara');
  });
  it('has the same IDs as runtime products', () => {
    expect(Object.keys(PRODUCT_MANIFESTS).sort()).toEqual([...PRODUCT_IDS].sort());
  });
});

describe('resolveBuildProductForMode', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'product-env-'));
    vi.stubEnv('VITE_PRODUCT_ID', undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });
  it('reads VITE_PRODUCT_ID from .env', () => {
    writeFileSync(join(dir, '.env'), 'VITE_PRODUCT_ID=synthara\n');
    expect(resolveBuildProductForMode('test', dir).id).toBe('synthara');
  });
  it('mode files override .env', () => {
    writeFileSync(join(dir, '.env'), 'VITE_PRODUCT_ID=vex\n');
    writeFileSync(join(dir, '.env.production'), 'VITE_PRODUCT_ID=synthara\n');
    expect(resolveBuildProductForMode('production', dir).id).toBe('synthara');
  });
  it('inline process env overrides files', () => {
    writeFileSync(join(dir, '.env'), 'VITE_PRODUCT_ID=synthara\n');
    vi.stubEnv('VITE_PRODUCT_ID', 'vex');
    expect(resolveBuildProductForMode('test', dir).id).toBe('vex');
  });
  it('unknown value from a file fails', () => {
    writeFileSync(join(dir, '.env'), 'VITE_PRODUCT_ID=acme\n');
    expect(() => resolveBuildProductForMode('test', dir)).toThrow('Expected one of: vex, synthara');
  });
});
