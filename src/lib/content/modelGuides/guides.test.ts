import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

vi.mock('$paraglide/messages', async (importOriginal) => {
  const messages = await importOriginal<typeof import('$paraglide/messages')>();
  return new Proxy(messages, {
    get: (target, key, receiver) =>
      typeof key === 'string' && key.startsWith('model_guide_')
        ? () => 'Localized copy'
        : Reflect.get(target, key, receiver),
  });
});

import { KNOWN_ASPECT_RATIOS } from '$lib/utils/modelCapabilities';
import { isGenerationMode, MODEL_TYPES } from '$lib/utils/generationModes';
import { modelGuides } from './guides';

describe('modelGuides', () => {
  it('is exhaustive and keeps each registry key aligned with its guide', () => {
    expect(Object.keys(modelGuides).sort()).toEqual([...MODEL_TYPES].sort());
    for (const [key, guide] of Object.entries(modelGuides)) {
      expect(guide.modelKey).toBe(key);
    }
  });

  it('contains valid, distinct prompt examples', () => {
    for (const guide of Object.values(modelGuides)) {
      expect(guide.examples.length).toBeGreaterThan(0);
      expect(new Set(guide.examples.map((example) => example.prompt)).size).toBe(
        guide.examples.length,
      );
      for (const example of guide.examples) {
        expect(example.prompt.trim()).not.toBe('');
        expect(isGenerationMode(example.mode)).toBe(true);
        expect(KNOWN_ASPECT_RATIOS).toContain(example.aspectRatio);
      }
    }
  });

  it('keeps every configured sample image in its model directory and present under static', () => {
    const configuredImages = Object.values(modelGuides).flatMap((guide) =>
      guide.examples.flatMap((example) =>
        example.image ? [{ modelKey: guide.modelKey, image: example.image }] : [],
      ),
    );

    expect(new Set(configuredImages.map(({ image }) => image)).size).toBe(configuredImages.length);
    for (const { modelKey, image } of configuredImages) {
      expect(image.startsWith(`/model-guides/${modelKey}/`)).toBe(true);
      expect(extname(image)).toBe('.webp');
      expect(existsSync(resolve('static', image.slice(1)))).toBe(true);
    }
  });
});
