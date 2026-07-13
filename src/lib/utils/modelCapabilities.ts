import type { components } from '$lib/api/types';

type ModelInfo = components['schemas']['ModelInfo'];
type AspectRatio = components['schemas']['AspectRatio'];

const KNOWN_ASPECT_RATIOS: readonly AspectRatio[] = [
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
  return editRatios.filter((r): r is AspectRatio => KNOWN_ASPECT_RATIOS.includes(r as AspectRatio));
}

/**
 * Whether the model exposes Aisha-style configurable image params
 * (quality tiers, custom width/height, sampler overrides).
 *
 * Current backend proxy: a non-null `image.supported_tiers`. Only Aisha image
 * models expose this today. If the backend later adds a dedicated capability
 * flag, or another provider starts exposing tiers, this is the single place to
 * refine the rule (e.g. also require `provisioning_mode === 'on_demand'`).
 */
export function supportsAishaImageParams(modelInfo: ModelInfo | null | undefined): boolean {
  return modelInfo?.image?.supported_tiers != null;
}
