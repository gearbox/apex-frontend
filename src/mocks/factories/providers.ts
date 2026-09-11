import type { components } from '$lib/api/types';
import { AISHA_IMAGE_CONSTRAINTS, AISHA_IMAGE_LITE_CONSTRAINTS } from '../fixtures/aisha';

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

/**
 * Matches current backend `master` (`src/core/model_registry.py`): t2i (no
 * source), i2i (exactly 1 owned image, no positional role). The generic
 * `DEFAULT_SOURCE_MEDIA` i2i default (min 1, max 4) is Grok-shaped, not
 * accurate for this model — override it explicitly.
 */
export function makeAishaImageModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return makeModelInfo({
    model_key: 'aisha-image',
    name: 'Aisha',
    description: 'Aisha image generation model',
    generation_modes: generationModes(['t2i', 'i2i'], {
      i2i: { min: 1, max: 1, media_types: ['image'], roles: null },
    }),
    max_images: 4,
    supports_negative_prompt: true,
    unsupported_parameters: [],
    aspect_ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    image: AISHA_IMAGE_CONSTRAINTS,
    ...overrides,
  });
}

/**
 * Matches current backend `master`: t2i only — no i2i/edit mode advertised;
 * `negative_prompt` unsupported (provider discovery reports it as an
 * unsupported parameter); requires age verification; cannot reshape on edit
 * (`image.edit_aspect_ratios: []`, via `AISHA_IMAGE_LITE_CONSTRAINTS`).
 */
export function makeAishaImageLiteModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return makeModelInfo({
    model_key: 'aisha-image-lite',
    name: 'Aisha Lite',
    description: 'Aisha lightweight image generation model',
    generation_modes: generationModes(['t2i']),
    max_images: 4,
    supports_negative_prompt: false,
    unsupported_parameters: ['negative_prompt'],
    aspect_ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    requires_age_verification: true,
    image: AISHA_IMAGE_LITE_CONSTRAINTS,
    ...overrides,
  });
}

/**
 * Matches current backend `master` (`src/core/model_registry.py`): t2v, i2v
 * (1 owned image, no positional role), v2v (1 owned video). Grok video does
 * not advertise flf2v — do not add it here without a backend contract change.
 */
export function makeGrokVideoModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return makeModelInfo({
    model_key: 'grok-imagine-video',
    name: 'Grok Video',
    description: 'Video generation model',
    generation_modes: generationModes(['t2v', 'i2v', 'v2v']),
    max_images: 1,
    image: null,
    video: { max_duration: 15, resolutions: ['480p', '720p'] },
    ...overrides,
  });
}

/**
 * Matches current backend `master`: t2v, i2v (1 owned image, `first_frame`
 * role), flf2v (2 owned images, `first_frame`/`last_frame` roles).
 */
export function makeAishaVideoModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return makeModelInfo({
    model_key: 'aisha-video',
    name: 'Aisha Video',
    description: 'Aisha video generation model',
    generation_modes: generationModes(['t2v', 'i2v', 'flf2v'], {
      i2v: { min: 1, max: 1, media_types: ['image'], roles: ['first_frame'] },
      flf2v: { min: 2, max: 2, media_types: ['image'], roles: ['first_frame', 'last_frame'] },
    }),
    max_images: 1,
    supports_negative_prompt: true,
    unsupported_parameters: [],
    aspect_ratios: ['1:1', '16:9', '9:16'],
    requires_age_verification: true,
    image: null,
    video: { max_duration: 10, resolutions: ['480p', '720p'] },
    ...overrides,
  });
}
