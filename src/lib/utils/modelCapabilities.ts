import type { components } from '$lib/api/types';
import { isMediaSlot } from './mediaSlots';

type ModelInfo = components['schemas']['ModelInfo'];
type AspectRatio = components['schemas']['AspectRatio'];
type MediaSlot = components['schemas']['MediaSlot'];

/**
 * The backend is the sole authority for the source-media picker, per the
 * currently selected mode's own contract in `generation_modes`. `min` bounds
 * cardinality and also drives requiredness: a mode requires source media only
 * when its `min > 0`.
 */
export interface SourceMediaPolicy {
  accepted: boolean;
  required: boolean;
  min: number;
  max: number;
  mediaTypes: readonly string[];
  /** null means positions are interchangeable. */
  roles: readonly MediaSlot[] | null;
  /** The provider advertised a role outside the frontend's closed protocol vocabulary. */
  hasUnknownRoles: boolean;
}

export function sourceMediaPolicy(
  modelInfo: ModelInfo | null | undefined,
  generationType: string,
): SourceMediaPolicy {
  const constraints = modelInfo?.generation_modes?.[generationType]?.source_media;
  if (constraints) {
    const rawRoles = constraints.roles ?? null;
    return {
      accepted: true,
      required: constraints.min > 0,
      min: constraints.min,
      max: constraints.max,
      mediaTypes: constraints.media_types,
      roles: rawRoles === null ? null : rawRoles.filter(isMediaSlot),
      hasUnknownRoles: rawRoles?.some((role) => !isMediaSlot(role)) ?? false,
    };
  }

  // A mode absent from discovery, or one whose source_media is explicitly
  // null, cannot safely imply media support. There is no cross-mode
  // requiredness list anymore — each mode's own `min` is the sole authority.
  return {
    accepted: false,
    required: false,
    min: 0,
    max: 0,
    mediaTypes: [],
    roles: null,
    hasUnknownRoles: false,
  };
}

/** Backend parameters with writable Create-draft controls. */
export type GenerationParameter =
  | 'aspect_ratio'
  | 'batch_size'
  | 'cfg'
  | 'denoise'
  | 'height'
  | 'image_resolution'
  | 'negative_prompt'
  | 'sampler'
  | 'scheduler'
  | 'seed'
  | 'steps'
  | 'width';

/** Returns the currently usable sizing mechanisms in draft/UI order. */
export function supportedSizingModes(
  modelInfo: ModelInfo | null | undefined,
): Array<'tier' | 'custom'> {
  const modes: Array<'tier' | 'custom'> = [];
  if (isGenerationParameterSupported(modelInfo, 'image_resolution')) modes.push('tier');
  if (
    isGenerationParameterSupported(modelInfo, 'width') &&
    isGenerationParameterSupported(modelInfo, 'height')
  ) {
    modes.push('custom');
  }
  return modes;
}

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
