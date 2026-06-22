import { describe, it, expect } from 'vitest';
import { supportsAishaImageParams } from './modelCapabilities';
import type { components } from '$lib/api/types';

type ModelInfo = components['schemas']['ModelInfo'];

const aishaModelInfo: ModelInfo = {
  model_key: 'aisha-image',
  name: 'Aisha',
  description: 'Aisha image generation model',
  capabilities: ['t2i', 'i2i'],
  is_enabled: true,
  max_images: 4,
  max_prompt_length: 4096,
  supports_negative_prompt: true,
  aspect_ratios: ['1:1'],
  requires_age_verification: false,
  image: {
    min_height: 256,
    max_height: 2048,
    default_height: 1024,
    output_resolutions: null,
    supported_tiers: ['draft', 'standard', 'high', 'ultra'],
    default_tier: 'standard',
    tier_megapixels: { draft: 0.25, standard: 1.0, high: 2.0, ultra: 4.0 },
  },
  video: null,
};

const grokModelInfo: ModelInfo = {
  model_key: 'grok-imagine-image',
  name: 'Grok Imagine',
  description: 'Fast image generation model',
  capabilities: ['t2i', 'i2i'],
  is_enabled: true,
  max_images: 10,
  max_prompt_length: 4096,
  supports_negative_prompt: false,
  aspect_ratios: ['1:1', '16:9', '9:16'],
  requires_age_verification: false,
  image: null,
  video: null,
};

describe('supportsAishaImageParams', () => {
  it('returns true for Aisha model with supported_tiers', () => {
    expect(supportsAishaImageParams(aishaModelInfo)).toBe(true);
  });

  it('returns false for Grok model (image: null)', () => {
    expect(supportsAishaImageParams(grokModelInfo)).toBe(false);
  });

  it('returns false for null modelInfo', () => {
    expect(supportsAishaImageParams(null)).toBe(false);
  });

  it('returns false for model with image.supported_tiers: null', () => {
    const modelWithNullTiers: ModelInfo = {
      ...aishaModelInfo,
      image: { ...aishaModelInfo.image!, supported_tiers: null },
    };
    expect(supportsAishaImageParams(modelWithNullTiers)).toBe(false);
  });
});
