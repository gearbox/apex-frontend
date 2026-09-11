import type { components } from '$lib/api/types';
import { AISHA_IMAGE_CONSTRAINTS } from '../fixtures/aisha';

type ModelInfo = components['schemas']['ModelInfo'];
type GenerationModeInfo = components['schemas']['GenerationModeInfo'];
type SourceMediaModeConstraints = components['schemas']['SourceMediaModeConstraints'];

/** Sensible per-mode source-media contracts for fixtures that only name a mode list. */
const DEFAULT_SOURCE_MEDIA: Partial<Record<string, SourceMediaModeConstraints>> = {
  i2i: { min: 1, max: 4, media_types: ['image'], roles: null },
  i2v: { min: 1, max: 1, media_types: ['image'], roles: null },
  v2v: { min: 1, max: 1, media_types: ['video'], roles: null },
  flf2v: { min: 2, max: 2, media_types: ['image'], roles: null },
};

/**
 * Builds a `generation_modes` map from a mode list, defaulting each mode's
 * `source_media` contract from `DEFAULT_SOURCE_MEDIA` (null for modes with no
 * default, e.g. t2i/t2v). Pass `overrides[mode]` (including `null`) to set a
 * mode's contract explicitly.
 */
export function generationModes(
  modes: readonly string[],
  overrides: Partial<Record<string, SourceMediaModeConstraints | null>> = {},
): Record<string, GenerationModeInfo> {
  const result: Record<string, GenerationModeInfo> = {};
  for (const mode of modes) {
    result[mode] = {
      source_media:
        mode in overrides ? (overrides[mode] ?? null) : (DEFAULT_SOURCE_MEDIA[mode] ?? null),
    };
  }
  return result;
}

/**
 * Grok-shaped defaults: `image: { edit_aspect_ratios: [] }` mirrors the contract-accurate
 * shape (grok-imagine-image accepts the edit param but cannot reshape) — never `image: null`.
 */
export function makeModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    model_key: 'grok-imagine-image',
    name: 'Grok Imagine',
    description: 'Fast image generation model',
    generation_modes: generationModes(['t2i', 'i2i']),
    is_enabled: true,
    max_images: 10,
    max_prompt_length: 4096,
    supports_negative_prompt: false,
    unsupported_parameters: ['negative_prompt'],
    aspect_ratios: ['1:1', '16:9', '9:16'],
    requires_age_verification: false,
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
    generation_modes: generationModes(['t2i', 'i2i']),
    max_images: 4,
    supports_negative_prompt: true,
    unsupported_parameters: [],
    aspect_ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    image: AISHA_IMAGE_CONSTRAINTS,
    ...overrides,
  });
}
