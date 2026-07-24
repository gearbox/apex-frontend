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

export function isGenerationMode(value: string | null | undefined): value is GenerationMode {
  return value != null && (GENERATION_MODES as readonly string[]).includes(value);
}

export const MODES_REQUIRING_SOURCE = [
  'i2i',
  'i2v',
  'v2v',
  'flf2v',
] as const satisfies readonly GenerationMode[];

export function modeRequiresSource(mode: GenerationMode): boolean {
  return (MODES_REQUIRING_SOURCE as readonly GenerationMode[]).includes(mode);
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

/** Every mode advertised by at least one enabled model, across all providers. */
export function enabledModes(providers: ProvidersResponse | null | undefined): Set<GenerationMode> {
  const modes = new Set<GenerationMode>();
  for (const provider of providers?.providers ?? []) {
    for (const model of provider.models) {
      if (!model.is_enabled) continue;
      for (const capability of model.capabilities) {
        if (isGenerationMode(capability)) modes.add(capability);
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
  return model.is_enabled && model.capabilities.includes(mode);
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
