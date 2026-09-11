import { describe, it, expect } from 'vitest';
import {
  getEditAspectRatios,
  KNOWN_ASPECT_RATIOS,
  isGenerationParameterSupported,
  sourceMediaPolicy,
  supportedSizingModes,
} from './modelCapabilities';
import type { components } from '$lib/api/types';
import {
  makeGrokImageModelInfo,
  makeAishaImageModelInfo,
  generationModes,
} from '../../mocks/factories/providers';

type ModelInfo = components['schemas']['ModelInfo'];

const aishaModelInfo: ModelInfo = makeAishaImageModelInfo();

// image: null is explicitly tested here — Grok's real contract shape is
// `image: { edit_aspect_ratios: [] }` (see the factory default), but null is still a
// valid input to guard against for older/degraded backend responses.
const grokModelInfo: ModelInfo = makeGrokImageModelInfo({ image: null });

describe('provider capabilities', () => {
  it('derives sizing controls from writable parameters, not quality tiers', () => {
    const modelWithNullTiers: ModelInfo = {
      ...aishaModelInfo,
      image: { ...aishaModelInfo.image!, supported_tiers: null },
    };
    expect(supportedSizingModes(modelWithNullTiers)).toEqual(['tier', 'custom']);
    expect(
      supportedSizingModes({
        ...modelWithNullTiers,
        unsupported_parameters: ['image_resolution'],
      }),
    ).toEqual(['custom']);
  });

  it('maps unsupported parameters centrally', () => {
    const constrained = { ...aishaModelInfo, unsupported_parameters: ['negative_prompt', 'seed'] };
    expect(isGenerationParameterSupported(constrained, 'negative_prompt')).toBe(false);
    expect(isGenerationParameterSupported(constrained, 'seed')).toBe(false);
    expect(isGenerationParameterSupported(constrained, 'cfg')).toBe(true);
  });

  it('derives requiredness solely from the mode-specific min > 0, including future modes', () => {
    const constrained = {
      ...grokModelInfo,
      generation_modes: generationModes(['t2i', 'future-edit'], {
        t2i: null,
        'future-edit': {
          min: 1,
          max: 2,
          media_types: ['image'] as components['schemas']['MediaKind'][],
          roles: null,
        },
      }),
    };
    expect(sourceMediaPolicy(constrained, 't2i').required).toBe(false);
    expect(sourceMediaPolicy(constrained, 'future-edit').required).toBe(true);
  });

  it('fails closed when a mode is absent from generation_modes instead of inventing legacy source requirements', () => {
    const withoutModes = { ...grokModelInfo, generation_modes: generationModes(['t2i']) };
    for (const mode of ['i2i', 'i2v', 'flf2v']) {
      expect(sourceMediaPolicy(withoutModes, mode)).toEqual({
        accepted: false,
        required: false,
        min: 0,
        max: 0,
        mediaTypes: [],
        roles: null,
      });
    }
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
