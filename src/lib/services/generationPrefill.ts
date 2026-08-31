import type { components } from '$lib/api/types';
import { mediaFallbackSrc } from '$lib/media';
import {
  generationStore,
  type GenerationMode,
  type GenerationState,
  type SourceMediaDraft,
} from '$lib/stores/generation';
import { findModelInfo, isGenerationMode, resolveModelForMode } from '$lib/utils/generationModes';
import {
  getEditAspectRatios,
  KNOWN_ASPECT_RATIOS,
  sourceMediaPolicy,
} from '$lib/utils/modelCapabilities';

type AspectRatio = components['schemas']['AspectRatio'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];
type ModelType = components['schemas']['ModelType'];
type ProvidersResponse = components['schemas']['ProvidersResponse'];
type MediaObject = components['schemas']['MediaObject'];

export interface SourcePrefillRequest {
  providers: ProvidersResponse | null | undefined;
  mode: GenerationMode;
  preferredModel?: string | null;
  source: SourceMediaDraft;
  /** Required for temporary v2v URL transport; never used as source_media. */
  inputVideoUrl?: string | null;
  prompt?: string;
  negativePrompt?: string;
}

/**
 * Applies a source-driven draft only after resolving an enabled model capable
 * of the target mode. Navigation intentionally remains the caller's concern:
 * callers may only navigate after this succeeds.
 */
export function prefillSourceForGeneration(request: SourcePrefillRequest): boolean {
  const model = resolveModelForMode(request.providers, request.mode, request.preferredModel);
  if (!model || (request.mode === 'v2v' && !request.inputVideoUrl?.trim())) return false;

  generationStore.prefill({
    model,
    mode: request.mode,
    ...(request.mode === 'v2v'
      ? { inputVideoUrl: request.inputVideoUrl ?? null }
      : { sourceMedia: [request.source] }),
    ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
    ...(request.negativePrompt === undefined ? {} : { negativePrompt: request.negativePrompt }),
  });
  return true;
}

export function sourceMediaDraft(
  assetRef: string,
  media: MediaObject,
  label: string | null,
): SourceMediaDraft {
  return {
    assetRef,
    mediaType: media.media_type,
    previewUrl: mediaFallbackSrc(media, 512),
    label,
    available: true,
  };
}

export interface ReplaySource {
  generation_type?: string | null;
  model?: string | null;
  prompt?: string | null;
  negative_prompt?: string | null;
  aspect_ratio?: string | null;
}

export type ReplayPrefillResult =
  | { ok: true; params: Partial<GenerationState> }
  | { ok: false; reason: 'no-model' | 'missing-source' | 'duplicate-source' };

function sourceMediaLabel(assetRef: string): string | null {
  if (assetRef.startsWith('output:')) return 'From generated';
  if (assetRef.startsWith('upload:')) return 'From uploads';
  return null;
}

/** i2i edits use edit ratios; every other mode uses the regular aspect ratio. */
export function aspectRatioPrefill(
  aspectRatio: string | null | undefined,
  mode: GenerationMode,
  model: ModelType,
  providers: ProvidersResponse | null | undefined,
): Pick<GenerationState, 'aspectRatio'> | Pick<GenerationState, 'editAspectRatio'> | undefined {
  if (!aspectRatio) return undefined;
  if (mode === 'i2i') {
    return (getEditAspectRatios(findModelInfo(providers, model)) as readonly string[]).includes(
      aspectRatio,
    )
      ? { editAspectRatio: aspectRatio as AspectRatio }
      : undefined;
  }
  return (KNOWN_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)
    ? { aspectRatio: aspectRatio as AspectRatio }
    : undefined;
}

/**
 * Builds an all-or-nothing replay draft from authoritative Library-group
 * inputs. It deliberately rejects duplicate source refs instead of silently
 * changing a Re-Generate request during normalization.
 */
export function replayGenerationPrefill(
  source: ReplaySource,
  providers: ProvidersResponse | null | undefined,
  group?: LibraryGroupDetail,
): ReplayPrefillResult {
  const mode: GenerationMode = isGenerationMode(source.generation_type)
    ? source.generation_type
    : 't2i';
  const model = resolveModelForMode(providers, mode, source.model);
  if (!model) return { ok: false, reason: 'no-model' };

  const modelInfo = findModelInfo(providers, model);
  const needsGroup = mode === 'v2v' || sourceMediaPolicy(modelInfo, mode).accepted;
  if (needsGroup && !group) return { ok: false, reason: 'missing-source' };
  if (mode === 'v2v' && !group?.input_media?.original.url) {
    return { ok: false, reason: 'missing-source' };
  }

  const sourceMedia = [...(group?.source_media ?? [])]
    .sort((a, b) => a.position - b.position)
    .map<SourceMediaDraft>((item) => ({
      assetRef: item.asset_ref,
      mediaType: item.media?.media_type ?? null,
      previewUrl: item.media ? mediaFallbackSrc(item.media, 512) : null,
      label: sourceMediaLabel(item.asset_ref),
      available: item.available,
    }));
  if (new Set(sourceMedia.map((item) => item.assetRef)).size !== sourceMedia.length) {
    return { ok: false, reason: 'duplicate-source' };
  }

  return {
    ok: true,
    params: {
      prompt: source.prompt ?? '',
      negativePrompt: source.negative_prompt ?? '',
      model,
      mode,
      // The temporary legacy v2v input remains URL-based. All owned-media
      // flows replay canonical source_media in stored positional order.
      ...(mode === 'v2v'
        ? { inputVideoUrl: group?.input_media?.original.url ?? null }
        : needsGroup
          ? { sourceMedia }
          : {}),
      ...aspectRatioPrefill(source.aspect_ratio, mode, model, providers),
    },
  };
}
