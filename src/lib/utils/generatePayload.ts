import type { components } from '$lib/api/types';
import type { GenerationState, SourceMediaDraft } from '$lib/stores/generation';
import { isGenerationParameterSupported, sourceMediaPolicy } from '$lib/utils/modelCapabilities';
import { normalizeVideoParams } from '$lib/utils/videoParams';
import { isMediaSlot, mediaKindForSlot, roleLabel, type MediaSlot } from '$lib/utils/mediaSlots';
import * as m from '$paraglide/messages';

type ModelInfo = components['schemas']['ModelInfo'];
type UnifiedGenerationRequest = components['schemas']['UnifiedGenerationRequest'];
type SourceMediaReference = components['schemas']['SourceMediaReference'];

export interface SourceMediaValidation {
  valid: boolean;
  message: string | null;
}

export type SourceMediaProjection =
  | { valid: true; sourceMedia: SourceMediaReference[] | undefined }
  | { valid: false; reason: string };

/** True when a role-tagged source is one this positional contract actually advertises. */
function isSupportedRole(
  role: MediaSlot | null,
  mediaType: string | null,
  roles: readonly MediaSlot[],
): boolean {
  return (
    role !== null &&
    isMediaSlot(role) &&
    roles.includes(role) &&
    mediaKindForSlot(role) === mediaType
  );
}

/**
 * Role-specific checks for a positional (`roles !== null`) contract, run only
 * after the generic availability/duplicate/media-kind checks above have
 * passed. This is the same strict validation boundary request projection
 * relies on — it never trusts that a caller already ran the resolver.
 */
function validatePositionalRoles(
  sourceMedia: readonly SourceMediaDraft[],
  roles: readonly MediaSlot[],
): SourceMediaValidation {
  for (const source of sourceMedia) {
    if (source.role !== null && !isMediaSlot(source.role)) {
      return { valid: false, message: m.error_source_role_unknown() };
    }
  }
  if (sourceMedia.some((source) => !isSupportedRole(source.role, source.mediaType, roles))) {
    return { valid: false, message: m.error_source_role_unsupported() };
  }
  const seenRoles = new Set<MediaSlot>();
  for (const source of sourceMedia) {
    const role = source.role as MediaSlot;
    if (seenRoles.has(role)) return { valid: false, message: m.error_source_role_duplicate() };
    seenRoles.add(role);
  }
  if (sourceMedia.length < roles.length) {
    const missing = roles.filter((role) => !seenRoles.has(role));
    if (missing.length === 1) {
      return {
        valid: false,
        message: m.error_source_role_missing({ role: roleLabel(missing[0]).toLowerCase() }),
      };
    }
  }
  return { valid: true, message: null };
}

/**
 * Validate the editable list against the latest discovery response. This is
 * deliberately shared by UI gating and request projection so the mode's own
 * `min` remains the only requiredness authority.
 */
export function validateSourceMedia(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): SourceMediaValidation {
  const policy = sourceMediaPolicy(modelInfo, state.mode);
  // A source-free mode may be submitted only with an empty draft. Retained
  // sources are incompatible with that contract; never treat them as valid
  // and silently omit them from the request during projection.
  if (!policy.accepted) {
    return state.sourceMedia.length === 0
      ? { valid: true, message: null }
      : { valid: false, message: m.create_source_current_incompatible() };
  }

  if (policy.hasUnknownRoles) {
    return { valid: false, message: m.error_source_role_unknown() };
  }

  if (state.sourceMedia.some((source) => !source.available)) {
    const unavailableRole = state.sourceMedia.find((source) => !source.available)?.role;
    return {
      valid: false,
      message:
        unavailableRole !== null && unavailableRole !== undefined && isMediaSlot(unavailableRole)
          ? m.error_source_role_unavailable({ role: roleLabel(unavailableRole).toLowerCase() })
          : 'Replace unavailable source media before generating.',
    };
  }
  const refs = state.sourceMedia.map((source) => source.assetRef);
  if (new Set(refs).size !== refs.length) {
    return { valid: false, message: 'Each source item must be selected only once.' };
  }
  if (
    state.sourceMedia.some(
      (source) =>
        source.mediaType === null || !policy.mediaTypes.includes(source.mediaType as never),
    )
  ) {
    return { valid: false, message: 'A selected source is not supported by this model.' };
  }
  if (state.sourceMedia.length > policy.max) {
    return { valid: false, message: `This model accepts at most ${policy.max} source items.` };
  }
  if (policy.roles === null && state.sourceMedia.some((source) => source.role !== null)) {
    return { valid: false, message: m.error_source_role_unsupported() };
  }
  if (policy.roles !== null) {
    const roleValidation = validatePositionalRoles(state.sourceMedia, policy.roles);
    if (!roleValidation.valid) return roleValidation;
  }
  if (policy.required && state.sourceMedia.length < policy.min) {
    return {
      valid: false,
      message: `This generation type needs at least ${policy.min} source item${policy.min === 1 ? '' : 's'}.`,
    };
  }
  return { valid: true, message: null };
}

/**
 * Projects the draft into the exact ordered `source_media` the backend will
 * receive. Projection defers entirely to `validateSourceMedia`: an invalid
 * draft is never filtered/truncated/deduplicated into a smaller — but
 * valid-looking — request. Callers that skip validation get an explicit
 * `valid: false` result instead of a silently repaired subset.
 *
 * For a positional (`roles !== null`) contract, the validated draft is
 * reordered into the advertised role order before projection — the store's
 * insertion order is editing convenience only, never wire order, once named
 * roles are involved. A roleless contract preserves insertion order exactly.
 * Role names themselves never enter the request body.
 */
export function projectSourceMedia(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): SourceMediaProjection {
  const policy = sourceMediaPolicy(modelInfo, state.mode);
  const validation = validateSourceMedia(state, modelInfo);
  if (!validation.valid) {
    return { valid: false, reason: validation.message ?? 'Invalid source media selection.' };
  }

  if (!policy.accepted) return { valid: true, sourceMedia: undefined };

  // Validation above guarantees, for a positional contract, that every role
  // is represented exactly once — `find` below can never come up empty.
  const orderedSources = policy.roles
    ? policy.roles.map(
        (role) => state.sourceMedia.find((source) => source.role === role) as SourceMediaDraft,
      )
    : state.sourceMedia;

  const sourceMedia = orderedSources.map(({ assetRef }) => ({ asset_ref: assetRef }));
  // `source_media`, when present, has a schema minimum of one item. Optional
  // source-media modes therefore omit the field instead of sending an invalid
  // empty array.
  return { valid: true, sourceMedia: sourceMedia.length > 0 ? sourceMedia : undefined };
}

/**
 * Normalize a validated draft using the live capability response immediately
 * before a request. The output contains no UI metadata and preserves source
 * order. Throws if the draft is invalid — callers must gate on
 * `validateSourceMedia`/`projectSourceMedia` first, as `handleGenerate` does.
 */
export function sourceMediaForRequest(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): SourceMediaReference[] | undefined {
  const projection = projectSourceMedia(state, modelInfo);
  if (!projection.valid) throw new Error(projection.reason);
  return projection.sourceMedia;
}

/**
 * Normalize output count from current batch support. The backend calls this
 * parameter `batch_size` in discovery even though the request field is `n`.
 */
export function outputCountForRequest(state: GenerationState, modelInfo: ModelInfo | null): number {
  if (!isGenerationParameterSupported(modelInfo, 'batch_size')) return 1;
  const requestedCount = Math.max(1, state.imageCount);
  return modelInfo ? Math.max(1, Math.min(requestedCount, modelInfo.max_images)) : requestedCount;
}

/**
 * Returns the normalized owned-media count used by the pricing quote, or
 * `null` when the current draft is invalid. Callers must suppress the quote
 * in that case rather than price a hidden, silently repaired subset.
 */
export function sourceMediaCountForRequest(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): number | null {
  const projection = projectSourceMedia(state, modelInfo);
  return projection.valid ? (projection.sourceMedia?.length ?? 0) : null;
}

/**
 * Projects every stale draft value through the currently selected ModelInfo.
 * It intentionally never writes the deprecated input-image aliases.
 */
export function buildGeneratePayload(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): UnifiedGenerationRequest {
  const videoParams = normalizeVideoParams(modelInfo, state.videoDuration, state.videoResolution);
  const sourceMedia = sourceMediaForRequest(state, modelInfo);

  const payload: UnifiedGenerationRequest = {
    prompt: state.prompt,
    generation_type: state.mode as UnifiedGenerationRequest['generation_type'],
    model: state.model,
    n: outputCountForRequest(state, modelInfo),
    duration: videoParams.duration,
    resolution: videoParams.resolution,
    ...(sourceMedia !== undefined ? { source_media: sourceMedia } : {}),
    ...(isGenerationParameterSupported(modelInfo, 'aspect_ratio')
      ? state.mode === 'i2i'
        ? state.editAspectRatio !== null
          ? { aspect_ratio: state.editAspectRatio }
          : {}
        : { aspect_ratio: state.aspectRatio }
      : {}),
    ...(isGenerationParameterSupported(modelInfo, 'negative_prompt') &&
    state.negativePrompt.trim().length > 0
      ? { negative_prompt: state.negativePrompt.trim() }
      : {}),
  };

  if (
    isGenerationParameterSupported(modelInfo, 'image_resolution') &&
    state.sizingMode === 'tier' &&
    state.imageTier !== null
  ) {
    payload.image_resolution = state.imageTier;
  } else if (
    state.sizingMode === 'custom' &&
    state.customWidth !== null &&
    state.customHeight !== null &&
    isGenerationParameterSupported(modelInfo, 'width') &&
    isGenerationParameterSupported(modelInfo, 'height')
  ) {
    payload.width = state.customWidth;
    payload.height = state.customHeight;
  }

  if (state.seed !== null && isGenerationParameterSupported(modelInfo, 'seed'))
    payload.seed = state.seed;
  if (state.steps !== null && isGenerationParameterSupported(modelInfo, 'steps')) {
    payload.steps = state.steps;
  }
  if (state.cfg !== null && isGenerationParameterSupported(modelInfo, 'cfg'))
    payload.cfg = state.cfg;
  if (state.sampler !== null && isGenerationParameterSupported(modelInfo, 'sampler')) {
    payload.sampler = state.sampler;
  }
  if (state.scheduler !== null && isGenerationParameterSupported(modelInfo, 'scheduler')) {
    payload.scheduler = state.scheduler;
  }
  if (state.denoise !== null && isGenerationParameterSupported(modelInfo, 'denoise')) {
    payload.denoise = state.denoise;
  }

  return payload;
}
