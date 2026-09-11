import type { components } from '$lib/api/types';
import type { GenerationState } from '$lib/stores/generation';
import { isGenerationParameterSupported, sourceMediaPolicy } from '$lib/utils/modelCapabilities';
import { normalizeVideoParams } from '$lib/utils/videoParams';

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
  if (!policy.accepted) return { valid: true, message: null };

  if (state.sourceMedia.some((source) => !source.available)) {
    return { valid: false, message: 'Replace unavailable source media before generating.' };
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
 */
export function projectSourceMedia(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): SourceMediaProjection {
  const policy = sourceMediaPolicy(modelInfo, state.mode);
  if (!policy.accepted) return { valid: true, sourceMedia: undefined };

  const validation = validateSourceMedia(state, modelInfo);
  if (!validation.valid) {
    return { valid: false, reason: validation.message ?? 'Invalid source media selection.' };
  }

  const sourceMedia = state.sourceMedia.map(({ assetRef }) => ({ asset_ref: assetRef }));
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
