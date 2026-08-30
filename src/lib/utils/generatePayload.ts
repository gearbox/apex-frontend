import type { components } from '$lib/api/types';
import type { GenerationState, SourceMediaDraft } from '$lib/stores/generation';
import {
  isGenerationParameterSupported,
  sourceMediaPolicy,
  type SourceMediaPolicy,
} from '$lib/utils/modelCapabilities';
import { normalizeVideoParams } from '$lib/utils/videoParams';

type ModelInfo = components['schemas']['ModelInfo'];
type UnifiedGenerationRequest = components['schemas']['UnifiedGenerationRequest'];
type SourceMediaReference = components['schemas']['SourceMediaReference'];

export interface SourceMediaValidation {
  valid: boolean;
  message: string | null;
}

function allowedSourceMedia(
  sourceMedia: readonly SourceMediaDraft[],
  policy: SourceMediaPolicy,
): SourceMediaDraft[] {
  if (!policy.accepted) return [];

  const selected: SourceMediaDraft[] = [];
  const seen = new Set<string>();
  for (const source of sourceMedia) {
    if (
      source.available &&
      source.mediaType !== null &&
      policy.mediaTypes.includes(source.mediaType as never) &&
      !seen.has(source.assetRef)
    ) {
      seen.add(source.assetRef);
      selected.push(source);
    }
  }
  return selected.slice(0, policy.max);
}

/**
 * Validate the editable list against the latest discovery response. This is
 * deliberately shared by UI gating and request projection so `required_for`
 * remains the only requiredness authority.
 */
export function validateSourceMedia(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): SourceMediaValidation {
  // v2v keeps its existing URL-based request path until the backend migrates it.
  if (state.mode === 'v2v') return { valid: true, message: null };
  const policy = sourceMediaPolicy(modelInfo, state.mode);
  if (!policy.accepted) return { valid: true, message: null };

  if (state.sourceMedia.some((source) => !source.available)) {
    return { valid: false, message: 'Replace unavailable source media before generating.' };
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
 * Normalize a draft using the live capability response immediately before a
 * request. The output contains no UI metadata and preserves source order.
 */
export function sourceMediaForRequest(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): SourceMediaReference[] | undefined {
  if (state.mode === 'v2v') return undefined;
  const policy = sourceMediaPolicy(modelInfo, state.mode);
  if (!policy.accepted) return undefined;
  const sourceMedia = allowedSourceMedia(state.sourceMedia ?? [], policy).map(({ assetRef }) => ({
    asset_ref: assetRef,
  }));
  // `source_media`, when present, has a schema minimum of one item. Optional
  // source-media modes therefore omit the field instead of sending an invalid
  // empty array.
  return sourceMedia.length > 0 ? sourceMedia : undefined;
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

/** Returns the normalized owned-media count used by the pricing quote. */
export function inputImageCountForRequest(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): number {
  return sourceMediaForRequest(state, modelInfo)?.length ?? 0;
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
    ...(state.mode === 'v2v' && state.inputVideoUrl
      ? { input_video_url: state.inputVideoUrl }
      : {}),
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
