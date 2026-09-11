import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';

export type { GenerationMode };

type ProvidersResponse = components['schemas']['ProvidersResponse'];
type ModelInfo = components['schemas']['ModelInfo'];
type ModelType = components['schemas']['ModelType'];
/** Frontend presentation classification for video parameter layout, not capability policy. */
export const VIDEO_MODES = [
  't2v',
  'i2v',
  'v2v',
  'flf2v',
] as const satisfies readonly GenerationMode[];

export function isGenerationMode(value: string | null | undefined): value is GenerationMode {
  return typeof value === 'string' && value.length > 0;
}

export function isVideoMode(mode: GenerationMode): boolean {
  return (VIDEO_MODES as readonly GenerationMode[]).includes(mode);
}

/** Returns backend-advertised modes. No client-side mode allow-list is applied. */
export function createSupportedModes(modelInfo: ModelInfo | null | undefined): GenerationMode[] {
  return Object.keys(modelInfo?.generation_modes ?? {}).filter(isGenerationMode);
}

/**
 * Every mode `resolveModelForMode` can satisfy with at least one enabled model, across
 * all providers. This must remain the exact visibility predicate for the resolver: an action
 * that is visible for a mode must always have a model it can select.
 */
export function enabledModes(providers: ProvidersResponse | null | undefined): Set<GenerationMode> {
  const modes = new Set<GenerationMode>();
  for (const provider of providers?.providers ?? []) {
    for (const model of provider.models) {
      if (!model.is_enabled) continue;
      for (const mode of Object.keys(model.generation_modes)) {
        if (isGenerationMode(mode)) modes.add(mode);
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
  return model.is_enabled && mode in model.generation_modes;
}

/**
 * Resolves the model to prefill for a target mode, in order:
 * 1. `preferred`, if it's an enabled model that supports `mode`.
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

  if (preferred) {
    const model = findModelInfo(providers, preferred);
    if (model && isCapableEnabledModel(model, mode)) return preferred as ModelType;
  }

  if (preferred) {
    const preferredProvider = providerList.find((provider) =>
      provider.models.some((model) => model.model_key === preferred),
    );
    const match = preferredProvider?.models.find((model) => isCapableEnabledModel(model, mode));
    if (match) return match.model_key as ModelType;
  }

  for (const provider of providerList) {
    const match = provider.models.find((model) => isCapableEnabledModel(model, mode));
    if (match) return match.model_key as ModelType;
  }

  return null;
}
