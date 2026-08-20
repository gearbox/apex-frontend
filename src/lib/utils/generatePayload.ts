import type { components } from '$lib/api/types';
import type { GenerationState } from '$lib/stores/generation';
import { supportsAishaImageParams } from '$lib/utils/modelCapabilities';

type ModelInfo = components['schemas']['ModelInfo'];
type UnifiedGenerationRequest = components['schemas']['UnifiedGenerationRequest'];

/**
 * Normalize the current UI's output count to the backend request contract.
 * Image modes use the selected count within the live model limit; video modes
 * submit one output regardless of stale hidden image-count state.
 */
export function outputCountForRequest(state: GenerationState, modelInfo: ModelInfo | null): number {
  if (state.mode !== 't2i' && state.mode !== 'i2i') return 1;

  const requestedCount = Math.max(1, state.imageCount);
  return modelInfo ? Math.max(1, Math.min(requestedCount, modelInfo.max_images)) : requestedCount;
}

export function buildGeneratePayload(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): UnifiedGenerationRequest {
  const isAishaImage = supportsAishaImageParams(modelInfo);

  // Aisha sizing block (only when gate is true)
  const aishaSize: Partial<UnifiedGenerationRequest> = {};
  if (isAishaImage) {
    if (
      state.sizingMode === 'custom' &&
      state.customWidth !== null &&
      state.customHeight !== null
    ) {
      aishaSize.width = state.customWidth;
      aishaSize.height = state.customHeight;
    } else if (state.sizingMode === 'tier' && state.imageTier !== null) {
      aishaSize.image_resolution = state.imageTier;
    }
  }

  // Aisha sampler overrides (only when gate is true)
  const aishaSampler: Partial<UnifiedGenerationRequest> = {};
  if (isAishaImage) {
    if (state.seed !== null) aishaSampler.seed = state.seed;
    if (state.steps !== null) aishaSampler.steps = state.steps;
    if (state.cfg !== null) aishaSampler.cfg = state.cfg;
    if (state.sampler !== null) aishaSampler.sampler = state.sampler;
    if (state.scheduler !== null) aishaSampler.scheduler = state.scheduler;
    if (state.denoise !== null) aishaSampler.denoise = state.denoise;
  }

  return {
    prompt: state.prompt,
    generation_type: state.mode,
    model: state.model,
    ...(state.mode === 'i2i'
      ? state.editAspectRatio !== null
        ? { aspect_ratio: state.editAspectRatio }
        : {}
      : { aspect_ratio: state.aspectRatio }),
    n: outputCountForRequest(state, modelInfo),
    duration: state.videoDuration,
    resolution: state.videoResolution,
    ...(state.uploadedImageId ? { input_image_id: state.uploadedImageId } : {}),
    ...(state.sourceOutputId ? { source_output_id: state.sourceOutputId } : {}),
    ...(modelInfo?.supports_negative_prompt === true && state.negativePrompt.trim().length > 0
      ? { negative_prompt: state.negativePrompt.trim() }
      : {}),
    ...aishaSize,
    ...aishaSampler,
  };
}
