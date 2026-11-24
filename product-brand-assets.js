import fs from 'node:fs';
import path from 'node:path';

export const BRAND_ASSET_FILES = /** @type {const} */ ([
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
]);

/** @param {{ productId: string, brandDir?: string }} options @returns {import('vite').Plugin} */
export function productBrandAssetsPlugin({ productId, brandDir = 'brand' }) {
  const dir = path.resolve(brandDir, productId);
  const missing = BRAND_ASSET_FILES.filter((file) => !fs.existsSync(path.join(dir, file)));
  if (missing.length)
    throw new Error(`Missing brand assets for ${productId}: ${missing.join(', ')}`);
  let client = true;
  return {
    name: 'apex-product-brand-assets',
    configResolved(config) {
      client = !config.build.ssr;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        const file = BRAND_ASSET_FILES.find((name) => pathname === `/${name}`);
        if (!file) return next();
        res.setHeader('Content-Type', file.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
        res.end(fs.readFileSync(path.join(dir, file)));
      });
    },
    generateBundle() {
      if (!client) return;
      for (const file of BRAND_ASSET_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: file,
          source: fs.readFileSync(path.join(dir, file)),
        });
      }
    },
  };
}
