import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BRAND_ASSET_FILES, productBrandAssetsPlugin } from '../../product-brand-assets.js';

describe('product brand assets', () => {
  it('rejects a product with missing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brand-test-'));
    try {
      expect(() => productBrandAssetsPlugin({ productId: 'missing', brandDir: dir })).toThrow(
        'favicon.svg',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('emits the selected product files', () => {
    const plugin = productBrandAssetsPlugin({ productId: 'synthara' });
    const emitFile = vi.fn();
    const generate = plugin.generateBundle;
    if (typeof generate !== 'function') throw new Error('Missing generateBundle hook');
    generate.call({ emitFile } as never, {} as never, {} as never, false);
    expect(emitFile.mock.calls.map(([asset]) => asset.fileName)).toEqual([...BRAND_ASSET_FILES]);
  });
  it('serves exact brand paths and passes other requests through', () => {
    const plugin = productBrandAssetsPlugin({ productId: 'vex' });
    let middleware: (
      req: { url: string },
      res: { setHeader: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
      next: ReturnType<typeof vi.fn>,
    ) => void = () => {};
    const configure = plugin.configureServer;
    if (typeof configure !== 'function') throw new Error('Missing configureServer hook');
    configure.call(
      {} as never,
      {
        middlewares: {
          use: (fn: typeof middleware) => {
            middleware = fn;
          },
        },
      } as never,
    );
    const res = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware({ url: '/favicon.svg' }, res, next);
    expect(res.end).toHaveBeenCalledOnce();
    middleware({ url: '/other/favicon.svg' }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
