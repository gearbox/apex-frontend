import type { components } from '$lib/api/types';
import type { GenerationState } from '$lib/stores/generation';

type ModelInfo = components['schemas']['ModelInfo'];
type UnifiedGenerationRequest = components['schemas']['UnifiedGenerationRequest'];

export function buildGeneratePayload(
  state: GenerationState,
  modelInfo: ModelInfo | null,
): UnifiedGenerationRequest {
  const isAishaImage = modelInfo?.image?.supported_tiers != null;

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
    aspect_ratio: state.aspectRatio,
    n: state.imageCount,
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
