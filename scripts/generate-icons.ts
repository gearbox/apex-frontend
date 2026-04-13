import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BACKGROUND_COLOR = '#110f0b';
const SVG_PATH = resolve('static/favicon.svg');
const OUTPUT_DIR = resolve('static');

interface IconSpec {
  name: string;
  size: number;
  padding: number; // fraction of size (0.2 = 20%)
}

const icons: IconSpec[] = [
  { name: 'icon-192.png', size: 192, padding: 0.15 },
  { name: 'icon-512.png', size: 512, padding: 0.2 },
  { name: 'apple-touch-icon.png', size: 180, padding: 0.15 },
];

async function generate() {
  const svgBuffer = readFileSync(SVG_PATH);

  for (const icon of icons) {
    const innerSize = Math.round(icon.size * (1 - icon.padding * 2));

    const resizedSvg = await sharp(svgBuffer)
      .resize(innerSize, innerSize, { fit: 'contain', background: 'transparent' })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: icon.size,
        height: icon.size,
        channels: 4,
        background: BACKGROUND_COLOR,
      },
    })
      .composite([
        {
          input: resizedSvg,
          gravity: 'centre',
        },
      ])
      .png()
      .toFile(resolve(OUTPUT_DIR, icon.name));

    console.log(`✓ Generated ${icon.name} (${icon.size}×${icon.size})`);
  }
}

generate().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
