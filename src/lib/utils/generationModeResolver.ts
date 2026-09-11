import type { components } from '$lib/api/types';

type ModelInfo = components['schemas']['ModelInfo'];
type SourceMediaModeConstraints = components['schemas']['SourceMediaModeConstraints'];

/** Provider-discovered generation modes are intentionally open-ended — never a frontend enum. */
export type GenerationMode = string;

export interface ResolverSource {
  assetRef: string;
  mediaType: string | null;
  available: boolean;
}

/**
 * A pure-domain disambiguation input, not yet wired to any Create UI. `reference`
 * means "a generic, position-independent source"; `role` names one of a
 * candidate's advertised positional `roles` (e.g. `last_frame`).
 */
export type SemanticSourceIntent = { kind: 'reference' } | { kind: 'role'; role: string };

export interface ModeResolutionInput {
  modelInfo: ModelInfo | null | undefined;
  sourceMedia: readonly ResolverSource[];
  /**
   * A genuine explicit intent (e.g. a model-guide example, or a future
   * Phase-4 positional action) to prefer, if any. Generic source-driven
   * Create never passes the mutable `generationStore.mode` here — doing so
   * would keep a stale selection sticky after the source that made it
   * relevant is removed.
   */
  preferredMode?: GenerationMode | null;
  semanticIntent?: SemanticSourceIntent | null;
}

export type ModeResolution =
  | {
      status: 'resolved';
      mode: GenerationMode;
      completeCandidates: GenerationMode[];
      incompleteCandidates: GenerationMode[];
    }
  | {
      status: 'incomplete';
      mode: GenerationMode;
      completeCandidates: GenerationMode[];
      incompleteCandidates: GenerationMode[];
    }
  | {
      status: 'ambiguous';
      candidates: GenerationMode[];
      completeCandidates: GenerationMode[];
      incompleteCandidates: GenerationMode[];
    }
  | { status: 'invalid'; reason: string; completeCandidates: []; incompleteCandidates: [] };

interface SourceConstraints {
  min: number;
  max: number;
  mediaTypes: readonly string[];
  /** null means positions are interchangeable (a generic reference-based mode). */
  roles: readonly string[] | null;
}

type CandidateStatus = 'complete' | 'incomplete' | 'incompatible';

function toConstraints(
  raw: SourceMediaModeConstraints | null | undefined,
): SourceConstraints | null {
  if (raw == null) return null;
  return { min: raw.min, max: raw.max, mediaTypes: raw.media_types, roles: raw.roles ?? null };
}

/** A `reference` intent wants a roleless candidate; a `role` intent wants that exact role advertised. */
function intentCompatibleWithRoles(
  roles: readonly string[] | null,
  semanticIntent: SemanticSourceIntent | null | undefined,
): boolean {
  if (!semanticIntent) return true;
  if (semanticIntent.kind === 'reference') return roles === null;
  return roles !== null && roles.includes(semanticIntent.role);
}

/**
 * Classifies a single advertised mode against the current source selection.
 * Deliberately does not check for duplicate asset refs or unavailable sources —
 * that per-item validation stays owned by the request validator
 * (`validateSourceMedia`/`projectSourceMedia`), which the effective mode this
 * resolver returns is always fed into before submission. This keeps the two
 * layers from disagreeing about the *mode* while letting the validator own
 * per-item repair-or-reject decisions.
 */
function classifyCandidate(
  constraints: SourceConstraints | null,
  sourceMedia: readonly ResolverSource[],
  semanticIntent: SemanticSourceIntent | null | undefined,
): CandidateStatus {
  if (constraints === null) {
    return sourceMedia.length === 0 ? 'complete' : 'incompatible';
  }

  if (!intentCompatibleWithRoles(constraints.roles, semanticIntent)) return 'incompatible';

  const count = sourceMedia.length;
  if (count > constraints.max) return 'incompatible';
  if (
    sourceMedia.some(
      (source) => source.mediaType === null || !constraints.mediaTypes.includes(source.mediaType),
    )
  ) {
    return 'incompatible';
  }
  return count < constraints.min ? 'incomplete' : 'complete';
}

/**
 * Pure, deterministic generation-mode resolver. No Svelte imports, no store
 * mutation, no navigation, no network I/O, no toasts — a function of its
 * explicit arguments only.
 *
 * Precedence:
 * 1. `preferredMode` (a genuine explicit intent — see `ModeResolutionInput`),
 *    if advertised and not `incompatible`, is preserved as-is: `resolved`
 *    when complete, `incomplete` when it's missing required source
 *    cardinality. Source-driven Create leaves this unset; only prefill/replay
 *    entry points with real explicit intent pass it.
 * 2. Otherwise, every advertised mode is classified as `complete`,
 *    `incomplete`, or `incompatible` against the current sources and optional
 *    `semanticIntent`. Exactly one `complete` candidate resolves; more than
 *    one is `ambiguous`. With no `complete` candidate, exactly one
 *    `incomplete` candidate is `incomplete`; more than one is `ambiguous`.
 *    Zero candidates of either kind is `invalid`.
 * 3. Candidate order is alphabetical, never advertised key order — ambiguity
 *    must never resolve by object/key iteration order.
 */
export function resolveGenerationMode(input: ModeResolutionInput): ModeResolution {
  const generationModes = input.modelInfo?.generation_modes ?? {};
  const modes = Object.keys(generationModes);
  if (modes.length === 0) {
    return {
      status: 'invalid',
      reason: 'This model does not advertise any generation modes.',
      completeCandidates: [],
      incompleteCandidates: [],
    };
  }

  const classification = new Map<GenerationMode, CandidateStatus>();
  for (const mode of modes) {
    const constraints = toConstraints(generationModes[mode]?.source_media);
    classification.set(
      mode,
      classifyCandidate(constraints, input.sourceMedia, input.semanticIntent),
    );
  }

  const completeCandidates = modes.filter((mode) => classification.get(mode) === 'complete').sort();
  const incompleteCandidates = modes
    .filter((mode) => classification.get(mode) === 'incomplete')
    .sort();

  const preferredMode = input.preferredMode ?? null;
  if (preferredMode !== null) {
    const preferredStatus = classification.get(preferredMode);
    if (preferredStatus === 'complete') {
      return { status: 'resolved', mode: preferredMode, completeCandidates, incompleteCandidates };
    }
    if (preferredStatus === 'incomplete') {
      return {
        status: 'incomplete',
        mode: preferredMode,
        completeCandidates,
        incompleteCandidates,
      };
    }
    // `incompatible`, or not advertised at all — do not force it; fall through.
  }

  if (completeCandidates.length === 1) {
    return {
      status: 'resolved',
      mode: completeCandidates[0],
      completeCandidates,
      incompleteCandidates,
    };
  }
  if (completeCandidates.length > 1) {
    return {
      status: 'ambiguous',
      candidates: completeCandidates,
      completeCandidates,
      incompleteCandidates,
    };
  }
  if (incompleteCandidates.length === 1) {
    return {
      status: 'incomplete',
      mode: incompleteCandidates[0],
      completeCandidates,
      incompleteCandidates,
    };
  }
  if (incompleteCandidates.length > 1) {
    return {
      status: 'ambiguous',
      candidates: incompleteCandidates,
      completeCandidates,
      incompleteCandidates,
    };
  }

  return {
    status: 'invalid',
    reason:
      input.sourceMedia.length > 0
        ? 'No generation mode accepts the current source selection.'
        : 'No generation mode is currently available for this model.',
    completeCandidates: [],
    incompleteCandidates: [],
  };
}
