import type { components } from '$lib/api/types';
import type { SourceMediaDraft } from '$lib/stores/generation';
import { resolveGenerationMode, type ResolverSource } from './generationModeResolver';
import { isMediaSlot, ROLE_DISPLAY_ORDER, type MediaSlot } from './mediaSlots';

type ModelInfo = components['schemas']['ModelInfo'];

/** Placeholder ref for hypothetical resolver probes — the resolver never checks asset-ref identity. */
const PROBE_ASSET_REF = '__source_media_affordance_probe__';

export function toResolverSources(sourceMedia: readonly SourceMediaDraft[]): ResolverSource[] {
  return sourceMedia.map((source) => ({
    assetRef: source.assetRef,
    mediaType: source.mediaType,
    available: source.available,
    role: source.role,
  }));
}

/**
 * Every distinct media kind accepted by any of the model's advertised
 * source-consuming modes — the raw union used to drive picker/file-input
 * `accept` filters. Never itself a validity contract: a kind appearing here
 * says nothing about whether it can legally be added/replaced right now
 * (see `appendableMediaKinds`/`replacementMediaKinds`).
 */
export function sourceConsumingMediaKinds(modelInfo: ModelInfo | null | undefined): string[] {
  const kinds = new Set<string>();
  for (const modeInfo of Object.values(modelInfo?.generation_modes ?? {})) {
    for (const kind of modeInfo?.source_media?.media_types ?? []) kinds.add(kind);
  }
  return [...kinds].sort();
}

/**
 * Whether the source-media section belongs on screen at all: either the
 * current model advertises at least one source-consuming mode, or a
 * (possibly now-incompatible) source is already retained in the draft. A
 * model whose only modes are source-free must never show source controls
 * for an empty draft, but a stale/incompatible retained source must never be
 * hidden either.
 */
export function isSourceSectionVisible(
  modelInfo: ModelInfo | null | undefined,
  sourceMedia: readonly SourceMediaDraft[],
): boolean {
  return sourceConsumingMediaKinds(modelInfo).length > 0 || sourceMedia.length > 0;
}

/**
 * A broad, display-only upper bound — the largest `max` advertised by any of
 * the model's source-consuming modes. This is never a policy limit (no
 * single mode is "the" active one pre-resolution); it only sizes UI like a
 * `count / max` counter.
 */
export function broadMaxSourceCount(modelInfo: ModelInfo | null | undefined): number {
  let max = 0;
  for (const modeInfo of Object.values(modelInfo?.generation_modes ?? {})) {
    if (modeInfo?.source_media) max = Math.max(max, modeInfo.source_media.max);
  }
  return max;
}

/** True when a non-empty draft cannot be used by this model under any advertised mode. */
export function isSourceDraftIncompatible(
  modelInfo: ModelInfo | null | undefined,
  sourceMedia: readonly ResolverSource[],
): boolean {
  if (sourceMedia.length === 0) return false;
  return resolveGenerationMode({ modelInfo, sourceMedia }).status === 'invalid';
}

/** True when the current draft is compatible with more than one mode and generic UI cannot disambiguate it. */
export function isSourceDraftAmbiguous(
  modelInfo: ModelInfo | null | undefined,
  sourceMedia: readonly ResolverSource[],
): boolean {
  return resolveGenerationMode({ modelInfo, sourceMedia }).status === 'ambiguous';
}

function hypotheticalStatusAllowsAction(
  modelInfo: ModelInfo | null | undefined,
  hypotheticalSourceMedia: readonly ResolverSource[],
): boolean {
  const status = resolveGenerationMode({ modelInfo, sourceMedia: hypotheticalSourceMedia }).status;
  return status === 'resolved' || status === 'incomplete';
}

/**
 * Media kinds that can legally be appended to the current draft right now,
 * derived by simulation rather than a lossy union of every mode's
 * constraints: each candidate kind is tried as an additional hypothetical
 * source, and offered only when the resulting draft still resolves or is a
 * legitimate work-in-progress (`incomplete`) — never when it would land on
 * `ambiguous`/`invalid`. This is what keeps generic "add source" UI from
 * ever creating a known ambiguity on its own.
 */
export function appendableMediaKinds(
  modelInfo: ModelInfo | null | undefined,
  sourceMedia: readonly ResolverSource[],
): string[] {
  return sourceConsumingMediaKinds(modelInfo).filter((kind) =>
    hypotheticalStatusAllowsAction(modelInfo, [
      ...sourceMedia,
      { assetRef: PROBE_ASSET_REF, mediaType: kind, available: true, role: null },
    ]),
  );
}

/**
 * Media kinds that can legally replace the source at `index`, derived by its
 * own replacement simulation — never by reusing `appendableMediaKinds`. This
 * keeps unavailable-source recovery working even when the draft is already
 * at whatever capacity blocks a plain append. The probe preserves the
 * existing item's role assignment: replacing an unavailable `last_frame`
 * must keep testing candidates as a `last_frame` replacement, never silently
 * downgrade it to a generic/interchangeable source.
 */
export function replacementMediaKinds(
  modelInfo: ModelInfo | null | undefined,
  sourceMedia: readonly ResolverSource[],
  index: number,
): string[] {
  if (index < 0 || index >= sourceMedia.length) return [];
  const role = sourceMedia[index].role;
  return sourceConsumingMediaKinds(modelInfo).filter((kind) =>
    hypotheticalStatusAllowsAction(
      modelInfo,
      sourceMedia.map((source, i) =>
        i === index
          ? { assetRef: PROBE_ASSET_REF, mediaType: kind, available: true, role }
          : source,
      ),
    ),
  );
}

/**
 * The union of named roles advertised by any of the model's positional
 * (`roles !== null`) source-consuming modes, in canonical display order.
 * Empty for a model with no positional contract at all — driving the generic
 * (Phase 3) list UI for those models unchanged. Non-empty roles are shown as
 * slots unconditionally, independent of the current resolution status, so
 * "Last frame" is visible even while only "First frame" is filled.
 */
export function roleSlotsForModel(modelInfo: ModelInfo | null | undefined): MediaSlot[] {
  const roles = new Set<MediaSlot>();
  for (const modeInfo of Object.values(modelInfo?.generation_modes ?? {})) {
    for (const role of modeInfo?.source_media?.roles ?? []) {
      if (isMediaSlot(role)) roles.add(role);
    }
  }
  return [...roles].sort((a, b) => ROLE_DISPLAY_ORDER.indexOf(a) - ROLE_DISPLAY_ORDER.indexOf(b));
}

/** The index of the draft item currently occupying `role`, or `null` if the slot is empty. */
export function sourceIndexForRole(
  sourceMedia: readonly SourceMediaDraft[],
  role: MediaSlot,
): number | null {
  const index = sourceMedia.findIndex((source) => source.role === role);
  return index === -1 ? null : index;
}

/** Sources carrying no explicit role — the generic/interchangeable list, in insertion order. */
export function interchangeableSourceMedia(
  sourceMedia: readonly SourceMediaDraft[],
): SourceMediaDraft[] {
  return sourceMedia.filter((source) => source.role === null);
}
