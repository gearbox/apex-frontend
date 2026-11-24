import fs from 'node:fs';
import path from 'node:path';
import { PRODUCT_MANIFESTS } from '../product-manifests.js';
import { BRAND_ASSET_FILES } from '../product-brand-assets.js';

const args = process.argv.slice(2);
const value = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const product = value('--product');
const dir = value('--dir', 'build');
if (!Object.hasOwn(PRODUCT_MANIFESTS, product)) throw new Error('Supply a valid --product');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest'), 'utf8'));
for (const key of ['name', 'short_name', 'theme_color', 'background_color']) {
  if (manifest[key] !== PRODUCT_MANIFESTS[product][key])
    throw new Error(`Incorrect manifest ${key}`);
}
if (manifest.icons.filter((icon) => icon.purpose?.split(/\s+/).includes('maskable')).length !== 1)
  throw new Error('Expected exactly one maskable icon');
for (const file of BRAND_ASSET_FILES) {
  if (
    !fs
      .readFileSync(path.join(dir, file))
      .equals(fs.readFileSync(path.join('brand', product, file)))
  )
    throw new Error(`Incorrect brand asset: ${file}`);
}
function checkHtml(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) checkHtml(file);
    else if (file.endsWith('.html') && fs.readFileSync(file, 'utf8').includes('%apex.'))
      throw new Error(`Unresolved token in ${file}`);
  }
}
checkHtml(dir);
const index = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
for (const [name, key] of [
  ['theme-color', 'theme_color'],
  ['apple-mobile-web-app-title', 'short_name'],
]) {
  if (!index.includes(`name="${name}" content="${PRODUCT_MANIFESTS[product][key]}"`))
    throw new Error(`Incorrect ${name}`);
}
console.log(`Product build verified: ${product}`);
