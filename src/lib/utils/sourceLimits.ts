import type { components } from '$lib/api/types';
import type { SourceMediaDraft } from '$lib/stores/generation';
import { videoLimits } from './videoParams';
import { MAX_UPLOAD_BYTES } from './constants';
import * as m from '$paraglide/messages';

type ModelInfo = components['schemas']['ModelInfo'];
const CONTENT_FORMATS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};
export function formatForContentType(ct: string): string | null {
  return CONTENT_FORMATS[ct.toLowerCase()] ?? null;
}
export function acceptedSourceContentTypes(model: ModelInfo | null, kind: string): string[] | null {
  const limits = kind === 'video' ? model?.video?.input_video : model?.video?.input_image;
  return limits
    ? Object.keys(CONTENT_FORMATS).filter((ct) => limits.formats.includes(CONTENT_FORMATS[ct]))
    : null;
}
export function formatDecimalBytes(bytes: number): string {
  return `${Number((bytes / 1_000_000).toFixed(2))} MB`;
}
function formatAndSizeViolation(
  ct: string,
  bytes: number,
  model: ModelInfo | null,
  kind: string,
): string | null {
  const limits = kind === 'video' ? model?.video?.input_video : model?.video?.input_image;
  if (!limits) return null;
  const format = formatForContentType(ct);
  if (!format || !limits.formats.includes(format))
    return m.source_formats({ formats: limits.formats.map((f) => f.toUpperCase()).join(', ') });
  if (limits.max_bytes != null && bytes > limits.max_bytes)
    return m.source_max_bytes({ limit: formatDecimalBytes(limits.max_bytes) });
  return null;
}
export function fileLimitViolation(
  file: File,
  modelInfo: ModelInfo | null,
  kind: string,
): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return m.library_upload_too_large();
  return formatAndSizeViolation(file.type, file.size, modelInfo, kind);
}
export function sourceMediaLimitViolation(
  draft: SourceMediaDraft,
  modelInfo: ModelInfo | null,
  mode: string,
  allSources: readonly SourceMediaDraft[],
): string | null {
  if (!draft.media) return null;
  const violation = formatAndSizeViolation(
    draft.media.content_type,
    draft.media.size_bytes,
    modelInfo,
    draft.mediaType ?? '',
  );
  if (violation) return violation;
  if (draft.mediaType !== 'video') return null;
  const limits = modelInfo?.video?.input_video;
  const duration = draft.media.duration_ms;
  if (limits && duration == null && (limits.min_duration_ms > 0 || limits.max_duration_ms != null))
    return m.source_duration_unknown();
  if (limits && duration != null) {
    if (duration < limits.min_duration_ms)
      return m.source_min_duration({ seconds: limits.min_duration_ms / 1000 });
    if (limits.max_duration_ms != null && duration > limits.max_duration_ms)
      return m.source_max_duration({ seconds: limits.max_duration_ms / 1000 });
  }
  return videoLimits(modelInfo, mode, allSources)?.sourceTooLongToExtend
    ? m.source_too_long_to_extend()
    : null;
}
