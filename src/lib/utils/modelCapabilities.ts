import type { components } from '$lib/api/types';

type ModelInfo = components['schemas']['ModelInfo'];
type AspectRatio = components['schemas']['AspectRatio'];

/**
 * The backend is the authority for both the source-media picker and its
 * requiredness. `min` is a cardinality limit, not an unconditional required
 * count: it applies only to modes listed in `required_for`.
 */
export interface SourceMediaPolicy {
  accepted: boolean;
  required: boolean;
  min: number;
  max: number;
  mediaTypes: readonly string[];
}

export function sourceMediaPolicy(
  modelInfo: ModelInfo | null | undefined,
  generationType: string,
): SourceMediaPolicy {
  const inputs = modelInfo?.inputs;
  const constraints = inputs?.source_media;
  if (constraints) {
    return {
      accepted: true,
      required: constraints.required_for.includes(generationType),
      min: constraints.min,
      max: constraints.max,
      mediaTypes: constraints.media_types,
    };
  }

  // Discovery added `inputs.source_media` after the original image picker
  // shipped. A missing `inputs` object therefore means a legacy response, not
  // that an i2i/i2v model rejects the established one-image request path.
  // An explicit `inputs: { source_media: null }` (or `{}`) remains authoritative
  // and deliberately disables the fallback.
  if (
    modelInfo?.inputs === undefined &&
    (generationType === 'i2i' || generationType === 'i2v' || generationType === 'flf2v')
  ) {
    return { accepted: true, required: true, min: 1, max: 1, mediaTypes: ['image'] };
  }

  return { accepted: false, required: false, min: 0, max: 0, mediaTypes: [] };
}

/** The complete backend vocabulary, mapped once to the draft controls it governs. */
export const GENERATION_PARAMETER_CONTROLS = {
  aspect_ratio: 'aspectRatio',
  batch_size: 'imageCount',
  cfg: 'cfg',
  denoise: 'denoise',
  height: 'customHeight',
  image_resolution: 'imageTier',
  negative_prompt: 'negativePrompt',
  sampler: 'sampler',
  scheduler: 'scheduler',
  seed: 'seed',
  steps: 'steps',
  width: 'customWidth',
} as const;

export type GenerationParameter = keyof typeof GENERATION_PARAMETER_CONTROLS;

export function isGenerationParameterSupported(
  modelInfo: ModelInfo | null | undefined,
  parameter: GenerationParameter,
): boolean {
  if (modelInfo == null || modelInfo.unsupported_parameters?.includes(parameter)) return false;

  // This pre-existing boolean is the compatibility contract for older provider
  // responses, which do not include an `unsupported_parameters` list.
  if (parameter === 'negative_prompt') return modelInfo.supports_negative_prompt === true;

  return true;
}

export function supportsAnyGenerationParameter(
  modelInfo: ModelInfo | null | undefined,
  parameters: readonly GenerationParameter[],
): boolean {
  return parameters.some((parameter) => isGenerationParameterSupported(modelInfo, parameter));
}

export const KNOWN_ASPECT_RATIOS: readonly AspectRatio[] = [
  '2:3',
  '3:2',
  '1:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
];

/**
 * The aspect ratios a model can genuinely reshape to during image editing (i2i).
 *
 * `edit_aspect_ratios` is the single source of truth for i2i — never fall back to
 * the t2i-only `aspect_ratios` field. Filtering against the known enum narrows the
 * generated `string[]` type safely and tolerates unrecognized future backend values.
 */
export function getEditAspectRatios(modelInfo: ModelInfo | null | undefined): AspectRatio[] {
  const editRatios = modelInfo?.image?.edit_aspect_ratios ?? [];
  return editRatios.filter((r): r is AspectRatio =>
    (KNOWN_ASPECT_RATIOS as readonly string[]).includes(r),
  );
}

/**
 * The aspect ratios a model accepts for t2i generation.
 *
 * `aspect_ratios` is the t2i-only field — never fall back to `image.edit_aspect_ratios`,
 * which governs i2i reshaping instead. Falls back to the full known set while modelInfo
 * hasn't resolved yet, so chips don't disappear during the providers query load.
 */
export function getT2iAspectRatios(modelInfo: ModelInfo | null | undefined): AspectRatio[] {
  const ratios = modelInfo?.aspect_ratios ?? KNOWN_ASPECT_RATIOS;
  return ratios.filter((r): r is AspectRatio =>
    (KNOWN_ASPECT_RATIOS as readonly string[]).includes(r),
  );
}

/** Whether image sizing metadata exists; individual control support is separate. */
export function hasImageSizingConstraints(modelInfo: ModelInfo | null | undefined): boolean {
  return modelInfo?.image?.supported_tiers != null;
}
