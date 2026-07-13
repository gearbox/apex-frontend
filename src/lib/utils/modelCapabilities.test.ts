import { describe, it, expect } from 'vitest';
import {
  supportsAishaImageParams,
  getEditAspectRatios,
  KNOWN_ASPECT_RATIOS,
} from './modelCapabilities';
import type { components } from '$lib/api/types';
import { makeGrokImageModelInfo, makeAishaImageModelInfo } from '../../mocks/factories/providers';

type ModelInfo = components['schemas']['ModelInfo'];

const aishaModelInfo: ModelInfo = makeAishaImageModelInfo();

// image: null is explicitly tested here — Grok's real contract shape is
// `image: { edit_aspect_ratios: [] }` (see the factory default), but null is still a
// valid input to guard against for older/degraded backend responses.
const grokModelInfo: ModelInfo = makeGrokImageModelInfo({ image: null });

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

describe('getEditAspectRatios', () => {
  it('returns [] when edit_aspect_ratios is an empty list (Grok — cannot reshape on edit)', () => {
    const grokWithEmptyEdit: ModelInfo = {
      ...grokModelInfo,
      image: { edit_aspect_ratios: [] },
    };
    expect(getEditAspectRatios(grokWithEmptyEdit)).toEqual([]);
  });

  it('returns the full list when the model supports all known ratios (Aisha)', () => {
    const aishaWithEdit: ModelInfo = {
      ...aishaModelInfo,
      image: {
        ...aishaModelInfo.image!,
        edit_aspect_ratios: [...KNOWN_ASPECT_RATIOS],
      },
    };
    expect(getEditAspectRatios(aishaWithEdit)).toEqual([...KNOWN_ASPECT_RATIOS]);
  });

  it('filters out unknown/unrecognized values from the backend', () => {
    const modelWithUnknown: ModelInfo = {
      ...aishaModelInfo,
      image: {
        ...aishaModelInfo.image!,
        edit_aspect_ratios: ['1:1', '21:9', '16:9', 'panorama'],
      },
    };
    expect(getEditAspectRatios(modelWithUnknown)).toEqual(['1:1', '16:9']);
  });

  it('returns [] for null modelInfo', () => {
    expect(getEditAspectRatios(null)).toEqual([]);
  });

  it('returns [] for undefined modelInfo', () => {
    expect(getEditAspectRatios(undefined)).toEqual([]);
  });

  it('returns [] when image block is missing (image: null)', () => {
    expect(getEditAspectRatios(grokModelInfo)).toEqual([]);
  });
});
