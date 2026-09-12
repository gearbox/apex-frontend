import type { components } from '$lib/api/types';
import { mediaFallbackSrc } from '$lib/media';
import {
  generationStore,
  type GenerationMode,
  type GenerationState,
  type SourceMediaDraft,
} from '$lib/stores/generation';
import {
  findModelInfo,
  isGenerationMode,
  modeForRole,
  resolveModelForMode,
  resolveModelForRole,
  soleAdvertisedRole,
} from '$lib/utils/generationModes';
import {
  getEditAspectRatios,
  KNOWN_ASPECT_RATIOS,
  sourceMediaPolicy,
} from '$lib/utils/modelCapabilities';
import type { MediaSlot } from '$lib/utils/mediaSlots';

type AspectRatio = components['schemas']['AspectRatio'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];
type ModelInfo = components['schemas']['ModelInfo'];
type ModelType = components['schemas']['ModelType'];
type ProvidersResponse = components['schemas']['ProvidersResponse'];
type MediaObject = components['schemas']['MediaObject'];

export interface SourcePrefillRequest {
  providers: ProvidersResponse | null | undefined;
  mode: GenerationMode;
  preferredModel?: string | null;
  source: SourceMediaDraft;
  prompt?: string;
  negativePrompt?: string;
}

/**
 * Applies a source-driven draft only after resolving an enabled model capable
 * of the target mode. Navigation intentionally remains the caller's concern:
 * callers may only navigate after this succeeds.
 *
 * The source's role is always re-derived from the *resolved model's own*
 * mode contract (`soleAdvertisedRole`), never taken from the caller or
 * inferred from the mode name: a roleless target mode (e.g. Grok's `i2v`)
 * keeps the source generic, while a target mode with exactly one advertised
 * role (e.g. Aisha's `i2v` -> `first_frame`) tags it automatically. A mode
 * advertising more than one role has no single deterministic assignment for
 * a lone incoming source, so it is left generic and the resulting (now
 * positional-vs-generic mismatched) draft is surfaced as incompatible by the
 * resolver rather than guessed here.
 */
export function prefillSourceForGeneration(request: SourcePrefillRequest): boolean {
  const model = resolveModelForMode(request.providers, request.mode, request.preferredModel);
  if (!model) return false;
  const modelInfo = findModelInfo(request.providers, model);

  generationStore.prefill({
    model,
    mode: request.mode,
    sourceMedia: [{ ...request.source, role: soleAdvertisedRole(modelInfo, request.mode) }],
    ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
    ...(request.negativePrompt === undefined ? {} : { negativePrompt: request.negativePrompt }),
  });
  return true;
}

export interface RoleSourcePrefillRequest {
  providers: ProvidersResponse | null | undefined;
  role: MediaSlot;
  preferredModel?: string | null;
  source: SourceMediaDraft;
  prompt?: string;
  negativePrompt?: string;
}

/**
 * The role-based counterpart to `prefillSourceForGeneration`, for Library
 * actions with no single target mode name (`use_as_first_frame` /
 * `use_as_last_frame`): resolves an enabled model actually capable of the
 * named role, tags the source with that exact role, and leaves the
 * *effective* generation mode to Create's own resolver — `mode` here is only
 * informational compatibility metadata for model-guide-style consumers.
 */
export function prefillRoleSourceForGeneration(request: RoleSourcePrefillRequest): boolean {
  const model = resolveModelForRole(request.providers, request.role, request.preferredModel);
  if (!model) return false;
  const modelInfo = findModelInfo(request.providers, model);

  generationStore.prefill({
    model,
    mode: modeForRole(modelInfo, request.role) ?? request.role,
    sourceMedia: [{ ...request.source, role: request.role }],
    ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
    ...(request.negativePrompt === undefined ? {} : { negativePrompt: request.negativePrompt }),
  });
  return true;
}

export function sourceMediaDraft(
  assetRef: string,
  media: MediaObject,
  label: string | null,
  role: MediaSlot | null = null,
): SourceMediaDraft {
  return {
    assetRef,
    mediaType: media.media_type,
    previewUrl: mediaFallbackSrc(media, 512),
    label,
    available: true,
    role,
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
  { ok: true; params: Partial<GenerationState> } | { ok: false; reason: ReplayFailureReason };

export type ReplayFailureReason =
  'no-model' | 'missing-source' | 'duplicate-source' | 'incompatible-source-policy';

export interface ReplayModelRequest {
  providers: ProvidersResponse | null | undefined;
  mode: GenerationMode;
  preferredModel?: string | null;
  /** Ordered persisted sources, including unavailable positional placeholders. */
  sourceMedia: readonly SourceMediaDraft[];
}

function sourceMediaLabel(assetRef: string): string | null {
  if (assetRef.startsWith('output:')) return 'From generated';
  if (assetRef.startsWith('upload:')) return 'From uploads';
  return null;
}

function isEnabledModeModel(model: ModelInfo, mode: GenerationMode): boolean {
  return model.is_enabled && mode in model.generation_modes;
}

function acceptsReplaySources(
  model: ModelInfo,
  mode: GenerationMode,
  sourceMedia: readonly SourceMediaDraft[],
): boolean {
  if (!isEnabledModeModel(model, mode)) return false;

  const policy = sourceMediaPolicy(model, mode);
  if (!policy.accepted || policy.max < sourceMedia.length) return false;
  // A positional contract's role count is fixed cardinality (`len(roles) ===
  // min === max`): a live contract that no longer has exactly as many roles
  // as the historical group had positions can never preserve that request's
  // semantics, so it must fail closed rather than partially replay it.
  if (policy.roles !== null && policy.roles.length !== sourceMedia.length) return false;

  // A missing media object is expected for unavailable historical positions.
  // Keep that position intact and let the Create UI require the user to replace it.
  return sourceMedia.every(
    (source) =>
      !source.available ||
      (source.mediaType !== null && policy.mediaTypes.includes(source.mediaType)),
  );
}

/** Assigns the live model's advertised role order onto replay positions — `null` for a roleless contract. */
function withReplayRoles(
  sourceMedia: readonly SourceMediaDraft[],
  modelInfo: ModelInfo | null,
  mode: GenerationMode,
): SourceMediaDraft[] {
  const { roles } = sourceMediaPolicy(modelInfo, mode);
  if (roles === null) return [...sourceMedia];
  return sourceMedia.map((source, index) => ({ ...source, role: roles[index] }));
}

/**
 * Resolves a replay target without weakening normal mode-only model selection.
 * An original source list must fit the live model policy in its entirety: it is
 * never normalized, shortened, or given a fabricated media kind here.
 */
export function resolveModelForReplay({
  providers,
  mode,
  preferredModel,
  sourceMedia,
}: ReplayModelRequest): ModelType | null {
  const providerList = providers?.providers ?? [];
  const preferredProvider = preferredModel
    ? providerList.find((provider) =>
        provider.models.some((model) => model.model_key === preferredModel),
      )
    : undefined;

  const originalModel = preferredProvider?.models.find(
    (model) => model.model_key === preferredModel,
  );
  if (originalModel && acceptsReplaySources(originalModel, mode, sourceMedia)) {
    return originalModel.model_key as ModelType;
  }

  const sameProviderModel = preferredProvider?.models.find(
    (model) => model.model_key !== preferredModel && acceptsReplaySources(model, mode, sourceMedia),
  );
  if (sameProviderModel) return sameProviderModel.model_key as ModelType;

  for (const provider of providerList) {
    if (provider === preferredProvider) continue;
    const model = provider.models.find((candidate) =>
      acceptsReplaySources(candidate, mode, sourceMedia),
    );
    if (model) return model.model_key as ModelType;
  }

  return null;
}

function hasEnabledModeModel(
  providers: ProvidersResponse | null | undefined,
  mode: GenerationMode,
): boolean {
  return (providers?.providers ?? []).some((provider) =>
    provider.models.some((model) => isEnabledModeModel(model, mode)),
  );
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
  if (!group) return { ok: false, reason: 'missing-source' };

  // Roles are unknown until a live model is resolved below — every position
  // starts generic here, purely for duplicate/model-fit checks.
  const positionalSourceMedia = [...(group.source_media ?? [])]
    .sort((a, b) => a.position - b.position)
    .map<SourceMediaDraft>((item) => ({
      assetRef: item.asset_ref,
      mediaType: item.media?.media_type ?? null,
      previewUrl: item.media ? mediaFallbackSrc(item.media, 512) : null,
      label: sourceMediaLabel(item.asset_ref),
      available: item.available,
      role: null,
    }));
  if (
    new Set(positionalSourceMedia.map((item) => item.assetRef)).size !==
    positionalSourceMedia.length
  ) {
    return { ok: false, reason: 'duplicate-source' };
  }

  const model =
    positionalSourceMedia.length > 0
      ? resolveModelForReplay({
          providers,
          mode,
          preferredModel: source.model,
          sourceMedia: positionalSourceMedia,
        })
      : resolveModelForMode(providers, mode, source.model);
  if (!model) {
    return {
      ok: false,
      reason:
        positionalSourceMedia.length > 0 && hasEnabledModeModel(providers, mode)
          ? 'incompatible-source-policy'
          : 'no-model',
    };
  }

  // Hydrate roles from the *live* resolved model's contract, by historical
  // position — `resolveModelForReplay` already guaranteed the role count
  // matches exactly when the contract is positional, so this never leaves a
  // position without its role.
  const sourceMedia = withReplayRoles(positionalSourceMedia, findModelInfo(providers, model), mode);

  return {
    ok: true,
    params: {
      prompt: source.prompt ?? '',
      negativePrompt: source.negative_prompt ?? '',
      model,
      mode,
      // Group source_media is the complete replay authority. Preserve the
      // canonical list even when the historical request had no owned sources.
      sourceMedia,
      ...aspectRatioPrefill(source.aspect_ratio, mode, model, providers),
    },
  };
}
