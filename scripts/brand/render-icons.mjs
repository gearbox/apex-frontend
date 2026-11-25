import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { PRODUCT_MANIFESTS } from '../../product-manifests.js';

const product = process.argv[process.argv.indexOf('--product') + 1];
if (!Object.hasOwn(PRODUCT_MANIFESTS, product))
  throw new Error(`Use --product with one of: ${Object.keys(PRODUCT_MANIFESTS).join(', ')}`);
const dir = path.join('brand', product);
const mark = await fs.readFile(path.join(dir, 'mark.svg'), 'utf8');
const content = mark.replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const background = PRODUCT_MANIFESTS[product].background_color;
for (const [file, size, scale] of [
  ['apple-touch-icon.png', 180, 0.68],
  ['icon-192.png', 192, 0.68],
  ['icon-512.png', 512, 0.68],
  ['icon-maskable-512.png', 512, 0.55],
]) {
  const markSize = size * scale;
  const offset = (size - markSize) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${background}"/><svg x="${offset}" y="${offset}" width="${markSize}" height="${markSize}" viewBox="0 0 100 100">${content}</svg></svg>`;
  const png = new Resvg(svg).render().asPng();
  await sharp(png).removeAlpha().png().toFile(path.join(dir, file));
}
