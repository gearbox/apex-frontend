import type { components } from '$lib/api/types';
import { AISHA_IMAGE_CONSTRAINTS } from '../fixtures/aisha';

type ModelInfo = components['schemas']['ModelInfo'];

/**
 * Grok-shaped defaults: `image: { edit_aspect_ratios: [] }` mirrors the contract-accurate
 * shape (grok-imagine-image accepts the edit param but cannot reshape) — never `image: null`.
 */
export function makeModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    model_key: 'grok-imagine-image',
    name: 'Grok Imagine',
    description: 'Fast image generation model',
    capabilities: ['t2i', 'i2i'],
    is_enabled: true,
    max_images: 10,
    max_prompt_length: 4096,
    supports_negative_prompt: false,
    unsupported_parameters: ['negative_prompt'],
    aspect_ratios: ['1:1', '16:9', '9:16'],
    requires_age_verification: false,
    inputs: {
      source_media: {
        min: 1,
        max: 4,
        media_types: ['image'],
        required_for: ['i2i'],
      },
    },
    image: { edit_aspect_ratios: [] },
    video: null,
    ...overrides,
  };
}

export function makeGrokImageModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return makeModelInfo(overrides);
}

export function makeAishaImageModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return makeModelInfo({
    model_key: 'aisha-image',
    name: 'Aisha',
    description: 'Aisha image generation model',
    capabilities: ['t2i', 'i2i'],
    max_images: 4,
    supports_negative_prompt: true,
    unsupported_parameters: [],
    aspect_ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    image: AISHA_IMAGE_CONSTRAINTS,
    ...overrides,
  });
}
