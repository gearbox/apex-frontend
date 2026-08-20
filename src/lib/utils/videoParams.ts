import type { components } from '$lib/api/types';
import type { GenerationState } from '$lib/stores/generation';

type ModelInfo = components['schemas']['ModelInfo'];
type VideoResolution = GenerationState['videoResolution'];

const DEFAULT_VIDEO_CONSTRAINTS = {
  maxDuration: 15,
  resolutions: ['480p', '720p'] as readonly VideoResolution[],
};

export interface VideoConstraints {
  readonly maxDuration: number;
  readonly resolutions: readonly VideoResolution[];
}

export function getVideoConstraints(modelInfo: ModelInfo | null): VideoConstraints {
  if (!modelInfo?.video || modelInfo.video.resolutions.length === 0) {
    return DEFAULT_VIDEO_CONSTRAINTS;
  }

  const resolutions = modelInfo.video.resolutions.filter(
    (resolution): resolution is VideoResolution => resolution === '480p' || resolution === '720p',
  );
  if (resolutions.length === 0) return DEFAULT_VIDEO_CONSTRAINTS;

  return {
    maxDuration: Math.max(1, modelInfo.video.max_duration),
    resolutions,
  };
}

export function normalizeVideoParams(
  modelInfo: ModelInfo | null,
  duration: number,
  resolution: VideoResolution,
): { duration: number; resolution: VideoResolution } {
  const constraints = getVideoConstraints(modelInfo);
  const normalizedDuration = Math.max(1, Math.min(duration, constraints.maxDuration));
  const normalizedResolution = constraints.resolutions.includes(resolution)
    ? resolution
    : constraints.resolutions.includes('720p')
      ? '720p'
      : constraints.resolutions[0];

  return { duration: normalizedDuration, resolution: normalizedResolution };
}
