import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe.each(['vex', 'synthara'])('%s brand assets', (product) => {
  it.each([
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
  ])('%s has the expected dimensions', (file, size) => {
    const png = readFileSync(`brand/${product}/${file}`);
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
    if (file === 'apple-touch-icon.png') expect(png[25]).toBe(2);
  });
});
