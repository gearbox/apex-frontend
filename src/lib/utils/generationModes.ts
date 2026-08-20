import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';

export type { GenerationMode };

type ProvidersResponse = components['schemas']['ProvidersResponse'];
type ModelInfo = components['schemas']['ModelInfo'];
type ModelType = components['schemas']['ModelType'];

/** Single source of truth for the six generation modes — see `GenerationType` in schema.json. */
export const GENERATION_MODES = [
  't2i',
  'i2i',
  't2v',
  'i2v',
  'v2v',
  'flf2v',
] as const satisfies readonly GenerationMode[];

/** Modes with complete source input and request-building support in Create. */
export const CREATE_SUPPORTED_MODES = [
  't2i',
  'i2i',
  't2v',
  'i2v',
] as const satisfies readonly GenerationMode[];

export const VIDEO_MODES = [
  't2v',
  'i2v',
  'v2v',
  'flf2v',
] as const satisfies readonly GenerationMode[];

export function isGenerationMode(value: string | null | undefined): value is GenerationMode {
  return value != null && (GENERATION_MODES as readonly string[]).includes(value);
}

export function isCreateSupportedMode(
  value: string | null | undefined,
): value is (typeof CREATE_SUPPORTED_MODES)[number] {
  return value != null && (CREATE_SUPPORTED_MODES as readonly string[]).includes(value);
}

export function isVideoMode(mode: GenerationMode): boolean {
  return (VIDEO_MODES as readonly GenerationMode[]).includes(mode);
}

export const MODES_REQUIRING_IMAGE_INPUT = [
  'i2i',
  'i2v',
  'flf2v',
] as const satisfies readonly GenerationMode[];

export const MODES_REQUIRING_VIDEO_INPUT = ['v2v'] as const satisfies readonly GenerationMode[];

/** @deprecated Prefer the image/video-specific helpers. */
export const MODES_REQUIRING_SOURCE = [
  ...MODES_REQUIRING_IMAGE_INPUT,
  ...MODES_REQUIRING_VIDEO_INPUT,
] as const satisfies readonly GenerationMode[];

export function modeRequiresImageInput(mode: GenerationMode): boolean {
  return (MODES_REQUIRING_IMAGE_INPUT as readonly GenerationMode[]).includes(mode);
}

export function modeRequiresVideoInput(mode: GenerationMode): boolean {
  return (MODES_REQUIRING_VIDEO_INPUT as readonly GenerationMode[]).includes(mode);
}

export function modeRequiresSource(mode: GenerationMode): boolean {
  return modeRequiresImageInput(mode) || modeRequiresVideoInput(mode);
}

/** Single source of truth for the five model keys — see `ModelType` in schema.json. */
export const MODEL_TYPES = [
  'aisha-image',
  'aisha-video',
  'grok-imagine-image',
  'grok-2-image-1212',
  'grok-imagine-video',
] as const satisfies readonly ModelType[];

export function isModelType(key: string): key is ModelType {
  return (MODEL_TYPES as readonly string[]).includes(key);
}

/** Returns backend-advertised modes that the current Create UI can submit. */
export function createSupportedModes(modelInfo: ModelInfo | null | undefined): GenerationMode[] {
  const capabilities = modelInfo?.capabilities ?? [];
  return CREATE_SUPPORTED_MODES.filter((mode) => capabilities.includes(mode));
}

/**
 * Every mode `resolveModelForMode` can satisfy with at least one enabled known model, across
 * all providers. This must remain the exact visibility predicate for the resolver: an action
 * that is visible for a mode must always have a model it can select.
 */
export function enabledModes(providers: ProvidersResponse | null | undefined): Set<GenerationMode> {
  const modes = new Set<GenerationMode>();
  for (const provider of providers?.providers ?? []) {
    for (const model of provider.models) {
      if (!model.is_enabled || !isModelType(model.model_key)) continue;
      for (const capability of model.capabilities) {
        if (isGenerationMode(capability) && isCreateSupportedMode(capability))
          modes.add(capability);
      }
    }
  }
  return modes;
}

export function findModelInfo(
  providers: ProvidersResponse | null | undefined,
  modelKey: string | null | undefined,
): ModelInfo | null {
  if (!modelKey) return null;
  for (const provider of providers?.providers ?? []) {
    const model = provider.models.find((m) => m.model_key === modelKey);
    if (model) return model;
  }
  return null;
}

function isCapableEnabledModel(model: ModelInfo, mode: GenerationMode): boolean {
  return isCreateSupportedMode(mode) && model.is_enabled && model.capabilities.includes(mode);
}

/**
 * Resolves the model to prefill for a target mode, in order:
 * 1. `preferred`, if it's a known, enabled model that supports `mode`.
 * 2. Otherwise an enabled capable model from the same provider as `preferred` — keeps the
 *    user in the model family they were already using (e.g. an image-only model swapped for
 *    that provider's video model).
 * 3. Otherwise the first enabled capable model in provider order.
 * 4. Otherwise `null` — no enabled model anywhere supports `mode`.
 */
export function resolveModelForMode(
  providers: ProvidersResponse | null | undefined,
  mode: GenerationMode,
  preferred?: string | null,
): ModelType | null {
  const providerList = providers?.providers ?? [];

  if (preferred && isModelType(preferred)) {
    const model = findModelInfo(providers, preferred);
    if (model && isCapableEnabledModel(model, mode)) return preferred;
  }

  if (preferred) {
    const preferredProvider = providerList.find((provider) =>
      provider.models.some((model) => model.model_key === preferred),
    );
    const match = preferredProvider?.models.find(
      (model) => isModelType(model.model_key) && isCapableEnabledModel(model, mode),
    );
    if (match) return match.model_key as ModelType;
  }

  for (const provider of providerList) {
    const match = provider.models.find(
      (model) => isModelType(model.model_key) && isCapableEnabledModel(model, mode),
    );
    if (match) return match.model_key as ModelType;
  }

  return null;
}
