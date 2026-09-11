import type { components } from '$lib/api/types';
import type { GenerationState } from '$lib/stores/generation';
import { sourceMediaPolicy } from '$lib/utils/modelCapabilities';
import {
  resolveGenerationMode,
  type ModeResolution,
  type ResolverSource,
} from '$lib/utils/generationModeResolver';

type ModelInfo = components['schemas']['ModelInfo'];

/** Fail-closed result for when the explicitly selected Type cannot be used as-is. */
const INCOMPATIBLE_TYPE_RESULT: ModeResolution = {
  status: 'invalid',
  reason: 'The selected generation type is incompatible with the current source media.',
  completeCandidates: [],
  incompleteCandidates: [],
};

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
 * The pure resolver's `preferredMode` fallback (incompatible/unadvertised
 * preferred mode -> resolve another candidate instead) is correct and stays
 * unchanged — it exists for the later source-driven phase. But while
 * `TypeSelector` is the explicit source of truth, this adapter must never let
 * that fallback surface a *different* concrete mode than `state.mode`: doing
 * so would let pricing/validation/payload submit under a mode the UI isn't
 * showing. So any resolution that doesn't concretely match `state.mode` —
 * including a resolved/incomplete fallback to another mode, or an ambiguous
 * result (which, by construction, never includes `state.mode` as a
 * candidate once the preferred-mode fallback has kicked in) — fails closed
 * here instead of being forwarded. This never touches `state.sourceMedia`;
 * the user resolves it by editing the source draft or picking a different
 * Type.
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

  const resolution = resolveGenerationMode({
    modelInfo,
    sourceMedia: visibleSources,
    preferredMode: state.mode,
  });

  if (resolution.status === 'ambiguous') return INCOMPATIBLE_TYPE_RESULT;
  if (resolution.status !== 'invalid' && resolution.mode !== state.mode) {
    return INCOMPATIBLE_TYPE_RESULT;
  }

  return resolution;
}
