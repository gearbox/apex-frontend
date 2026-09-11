import type { components } from '$lib/api/types';
import type { GenerationState } from '$lib/stores/generation';
import { sourceMediaPolicy } from '$lib/utils/modelCapabilities';
import {
  resolveGenerationMode,
  type ModeResolution,
  type ResolverSource,
} from '$lib/utils/generationModeResolver';

type ModelInfo = components['schemas']['ModelInfo'];

/**
 * Phase-2-only compatibility boundary between the still-visible `TypeSelector`
 * and the pure resolver. Phase 1's Create UX only ever shows source controls
 * for the explicitly selected Type (`SourceMediaInput` is gated on
 * `sourceMediaPolicy(modelInfo, $generationStore.mode).accepted`), so a source
 * left in the store from a prior Type selection (e.g. an I2I source after
 * switching back to T2I) must not silently redirect the resolver to a
 * different mode than the one the UI is showing/submitting.
 *
 * This never mutates or drops `state.sourceMedia` — it only narrows what the
 * pure resolver *sees* when the explicitly selected mode does not itself
 * accept media, mirroring the legacy hide-on-switch behavior.
 *
 * TODO(Phase 3): delete this adapter once source media becomes independently
 * visible/source-driven and `TypeSelector` is removed — at that point every
 * stored source is always a real resolver input.
 */
export function resolveEffectiveGenerationMode(
  state: GenerationState,
  modelInfo: ModelInfo | null | undefined,
): ModeResolution {
  const explicitPolicy = sourceMediaPolicy(modelInfo, state.mode);
  const visibleSources: ResolverSource[] = explicitPolicy.accepted
    ? state.sourceMedia.map((source) => ({
        assetRef: source.assetRef,
        mediaType: source.mediaType,
        available: source.available,
      }))
    : [];

  return resolveGenerationMode({
    modelInfo,
    sourceMedia: visibleSources,
    preferredMode: state.mode,
  });
}
