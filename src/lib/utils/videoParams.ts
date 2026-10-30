import { videoResolutionValues, type components } from '$lib/api/types';
import type { GenerationMode, GenerationState, SourceMediaDraft } from '$lib/stores/generation';
import { isVideoMode } from './generationModes';
import * as m from '$paraglide/messages';

type ModelInfo = components['schemas']['ModelInfo'];
type VideoResolution = components['schemas']['VideoResolution'];

export interface VideoLimits {
  minDuration: number;
  maxDuration: number;
  resolutions: readonly VideoResolution[];
  defaultResolution: VideoResolution;
  supported: ReadonlySet<'audio' | 'prompt_extend'>;
  anchoredModes: ReadonlySet<GenerationMode>;
  sourceTooLongToExtend: boolean;
}

export function videoLimits(
  modelInfo: ModelInfo | null,
  mode: GenerationMode,
  sources: readonly SourceMediaDraft[],
): VideoLimits | null {
  const video = modelInfo?.video;
  if (!video) return null;
  const resolutions = video.resolutions.filter((r): r is VideoResolution =>
    videoResolutionValues.some((known) => known === r),
  );
  if (resolutions.length === 0) return null;
  let maxDuration = video.max_duration;
  const clips = sources.filter((s) => s.mediaType === 'video');
  if (
    isVideoMode(mode) &&
    clips.length > 0 &&
    video.max_combined_duration != null &&
    clips.every((s) => s.media?.duration_ms != null)
  ) {
    maxDuration = Math.min(
      maxDuration,
      video.max_combined_duration -
        clips.reduce((sum, s) => sum + Math.ceil(s.media!.duration_ms! / 1000), 0),
    );
  }
  return {
    minDuration: video.min_duration,
    maxDuration,
    resolutions,
    defaultResolution: resolutions.includes('720p') ? '720p' : resolutions[0],
    supported: new Set(
      video.supported_parameters.filter(
        (p): p is 'audio' | 'prompt_extend' => p === 'audio' || p === 'prompt_extend',
      ),
    ),
    anchoredModes: new Set(video.input_anchored_modes ?? []),
    sourceTooLongToExtend: maxDuration < video.min_duration,
  };
}

export function normalizeVideoParams(
  limits: VideoLimits,
  duration: number,
  resolution: VideoResolution,
): { duration: number; resolution: VideoResolution } {
  return {
    duration: Math.max(
      limits.minDuration,
      Math.min(
        Math.round(Number.isFinite(duration) ? duration : limits.minDuration),
        limits.maxDuration,
      ),
    ),
    resolution: limits.resolutions.includes(resolution) ? resolution : limits.defaultResolution,
  };
}

export function videoParameterViolation(
  state: GenerationState,
  model: ModelInfo | null,
): string | null {
  if (!isVideoMode(state.mode)) return null;
  const limits = videoLimits(model, state.mode, state.sourceMedia);
  if (!limits) return m.video_unavailable();
  if (limits.sourceTooLongToExtend) return m.source_too_long_to_extend();
  const seed = state.videoSeed;
  const range = model?.seed_range;
  if (
    range &&
    seed !== null &&
    (!Number.isInteger(seed) || seed < range.min || seed > range.max || seed === -1)
  ) {
    return m.video_seed_range({ min: range.min, max: range.max });
  }
  return null;
}
