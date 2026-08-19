import { describe, expect, it, vi } from 'vitest';

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

  it('contains valid, distinct prompt examples without configured duplicate paths', () => {
    for (const guide of Object.values(modelGuides)) {
      expect(guide.examples.length).toBeGreaterThan(0);
      expect(new Set(guide.examples.map((example) => example.prompt)).size).toBe(
        guide.examples.length,
      );
      expect(
        new Set(guide.examples.flatMap((example) => (example.image ? [example.image] : []))).size,
      ).toBe(guide.examples.filter((example) => example.image).length);
      for (const example of guide.examples) {
        expect(example.prompt.trim()).not.toBe('');
        expect(isGenerationMode(example.mode)).toBe(true);
        expect(KNOWN_ASPECT_RATIOS).toContain(example.aspectRatio);
      }
    }
  });
});
