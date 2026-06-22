import type { components } from '$lib/api/types';

type ModelInfo = components['schemas']['ModelInfo'];

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
