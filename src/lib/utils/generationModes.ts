import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';
import { isMediaSlot, mediaKindForSlot, type MediaSlot } from './mediaSlots';

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

/**
 * Every named role satisfiable by at least one enabled model's advertised
 * positional (`roles !== null`) source-consuming mode, across all providers.
 * This is the Library role-action visibility predicate: `use_as_first_frame`
 * / `use_as_last_frame` must never be shown from `availableModes.has(...)`
 * alone (there is no fixed mode name for a role), and must never be shown
 * merely because a role name appears in a *disabled* model's contract.
 */
export function enabledRoles(providers: ProvidersResponse | null | undefined): Set<MediaSlot> {
  const roles = new Set<MediaSlot>();
  for (const provider of providers?.providers ?? []) {
    for (const model of provider.models) {
      if (!model.is_enabled) continue;
      for (const modeInfo of Object.values(model.generation_modes)) {
        for (const role of modeInfo?.source_media?.roles ?? []) {
          if (isMediaSlot(role)) roles.add(role);
        }
      }
    }
  }
  return roles;
}

function isCapableEnabledModelForRole(model: ModelInfo, role: MediaSlot): boolean {
  if (!model.is_enabled) return false;
  const mediaKind = mediaKindForSlot(role);
  return Object.values(model.generation_modes).some((modeInfo) => {
    const constraints = modeInfo?.source_media;
    return (
      constraints?.roles != null &&
      constraints.roles.some(
        (advertisedRole) => isMediaSlot(advertisedRole) && advertisedRole === role,
      ) &&
      constraints.media_types.includes(mediaKind)
    );
  });
}

function resolveEnabledModel(
  providers: ProvidersResponse | null | undefined,
  predicate: (model: ModelInfo) => boolean,
  preferred?: string | null,
): ModelInfo | null {
  const providerList = providers?.providers ?? [];
  const isCandidate = (model: ModelInfo) => model.is_enabled && predicate(model);

  if (preferred) {
    const model = findModelInfo(providers, preferred);
    if (model && isCandidate(model)) return model;
  }

  if (preferred) {
    const preferredProvider = providerList.find((provider) =>
      provider.models.some((model) => model.model_key === preferred),
    );
    const match = preferredProvider?.models.find(isCandidate);
    if (match) return match;
  }

  for (const provider of providerList) {
    const match = provider.models.find(isCandidate);
    if (match) return match;
  }

  return null;
}

/**
 * Resolves the model to prefill for a named role intent, mirroring
 * `resolveModelForMode`'s preference cascade exactly (preferred model, then
 * same provider, then any enabled provider) but keyed on role capability
 * instead of a fixed mode name — there is no single mode name a role-based
 * Library action can target directly.
 */
export function resolveModelForRole(
  providers: ProvidersResponse | null | undefined,
  role: MediaSlot,
  preferred?: string | null,
): ModelType | null {
  const model = resolveEnabledModel(
    providers,
    (candidate) => isCapableEnabledModelForRole(candidate, role),
    preferred,
  );
  return model ? (model.model_key as ModelType) : null;
}

/**
 * The first (alphabetically, for determinism) advertised mode whose
 * positional contract includes `role` — informational only. `generationStore.mode`
 * is compatibility metadata; the actual effective mode is always recomputed
 * live by the resolver from the draft's own role assignments.
 */
export function modeForRole(
  modelInfo: ModelInfo | null | undefined,
  role: MediaSlot,
): GenerationMode | null {
  const modes = Object.entries(modelInfo?.generation_modes ?? {})
    .filter(([, info]) =>
      info?.source_media?.roles?.some(
        (advertisedRole) => isMediaSlot(advertisedRole) && advertisedRole === role,
      ),
    )
    .map(([mode]) => mode)
    .sort();
  return modes[0] ?? null;
}

/**
 * The sole role a mode advertises, or `null` when the mode is roleless or
 * advertises more than one role. Used to tag a source's role automatically
 * from the *resolved model's own contract* — never from the mode name or a
 * hardcoded table — so e.g. Animate assigns `first_frame` only when the
 * target model's i2v contract actually names it.
 */
export function soleAdvertisedRole(
  modelInfo: ModelInfo | null | undefined,
  mode: GenerationMode,
): MediaSlot | null {
  const roles = modelInfo?.generation_modes?.[mode]?.source_media?.roles;
  return roles != null && roles.length === 1 && isMediaSlot(roles[0]) ? roles[0] : null;
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
  const model = resolveEnabledModel(
    providers,
    (candidate) => isCapableEnabledModel(candidate, mode),
    preferred,
  );
  return model ? (model.model_key as ModelType) : null;
}

export interface ReferenceModelTarget {
  model: ModelType;
  mode: GenerationMode;
  role: null | 'reference';
}

function referenceTargetForModel(model: ModelInfo): Omit<ReferenceModelTarget, 'model'> | null {
  // Preserve the current i2i behavior when it is explicitly roleless. A named
  // reference role remains available for providers that expose a future
  // reference-shaped mode without i2i.
  const rolelessI2i = model.generation_modes.i2i?.source_media;
  if (
    rolelessI2i &&
    (rolelessI2i?.roles ?? null) === null &&
    rolelessI2i.media_types.includes('image')
  ) {
    return { mode: 'i2i', role: null };
  }

  const namedReferenceMode = Object.entries(model.generation_modes)
    .filter(([, modeInfo]) => {
      const constraints = modeInfo?.source_media;
      return (
        constraints?.roles?.some((role) => isMediaSlot(role) && role === 'reference') === true &&
        constraints.media_types.includes(mediaKindForSlot('reference'))
      );
    })
    .map(([mode]) => mode)
    .sort()[0];
  return namedReferenceMode ? { mode: namedReferenceMode, role: 'reference' } : null;
}

/**
 * Resolves the one target that the Library's “Use as reference” action can
 * actually prefill. This is shared by action visibility and execution so an
 * advertised action is never a dead end.
 */
export function resolveModelForReference(
  providers: ProvidersResponse | null | undefined,
  preferred?: string | null,
): ReferenceModelTarget | null {
  const model = resolveEnabledModel(
    providers,
    (candidate) => referenceTargetForModel(candidate) !== null,
    preferred,
  );
  const target = model ? referenceTargetForModel(model) : null;
  return model && target ? { model: model.model_key as ModelType, ...target } : null;
}
