import type { components } from '$lib/api/types';
import { isMediaSlot, mediaKindForSlot, type MediaSlot } from './mediaSlots';

type ModelInfo = components['schemas']['ModelInfo'];
type SourceMediaModeConstraints = components['schemas']['SourceMediaModeConstraints'];

/** Provider-discovered generation modes are intentionally open-ended — never a frontend enum. */
export type GenerationMode = string;

export interface ResolverSource {
  assetRef: string;
  mediaType: string | null;
  available: boolean;
  /**
   * The source's own semantic assignment: `null` for a generic/interchangeable
   * source, or one of the model's protocol role names. This single
   * source-level field is what disambiguates candidates — a role-tagged
   * source narrows candidacy to positional (`roles !== null`) modes that
   * advertise that exact role, and a generic source narrows candidacy to
   * interchangeable (`roles === null`) modes. Neither silently satisfies the
   * other's contract.
   */
  role: MediaSlot | null;
}

export interface ModeResolutionInput {
  modelInfo: ModelInfo | null | undefined;
  sourceMedia: readonly ResolverSource[];
  /**
   * A genuine explicit intent (e.g. a model-guide example, or a replay) to
   * prefer, if any. Generic source-driven Create never passes the mutable
   * `generationStore.mode` here — doing so would keep a stale selection
   * sticky after the source that made it relevant is removed.
   */
  preferredMode?: GenerationMode | null;
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
  roles: readonly MediaSlot[] | null;
  hasUnknownRoles: boolean;
}

type CandidateStatus = 'complete' | 'incomplete' | 'incompatible';

function toConstraints(
  raw: SourceMediaModeConstraints | null | undefined,
): SourceConstraints | null {
  if (raw == null) return null;
  const rawRoles = raw.roles ?? null;
  return {
    min: raw.min,
    max: raw.max,
    mediaTypes: raw.media_types,
    roles: rawRoles === null ? null : rawRoles.filter(isMediaSlot),
    hasUnknownRoles: rawRoles?.some((role) => !isMediaSlot(role)) ?? false,
  };
}

/**
 * Classifies a single advertised mode against the current source selection.
 * Deliberately does not check for duplicate asset refs or unavailable sources —
 * that per-item validation stays owned by the request validator
 * (`validateSourceMedia`/`projectSourceMedia`), which the effective mode this
 * resolver returns is always fed into before submission. This keeps the two
 * layers from disagreeing about the *mode* while letting the validator own
 * per-item repair-or-reject decisions.
 *
 * Role semantics are the Phase 4 disambiguation mechanism, replacing the
 * earlier `SemanticSourceIntent` seam entirely: a source's own `role` now
 * carries every distinction that seam existed to express.
 * - `roles === null` (interchangeable): every selected source must itself be
 *   generic (`role === null`). A source explicitly assigned a named role must
 *   never silently satisfy an interchangeable candidate.
 * - `roles !== null` (positional): every selected source must carry a role
 *   from this candidate's advertised set, exactly once each, with a media
 *   kind matching that role's protocol-fixed kind. A generic (`role: null`)
 *   source must never silently satisfy a positional candidate. `len(roles)`
 *   equals both `min` and `max` by contract, so a non-empty proper subset of
 *   the required roles is a legitimate sparse `incomplete` draft.
 */
function classifyCandidate(
  constraints: SourceConstraints | null,
  sourceMedia: readonly ResolverSource[],
): CandidateStatus {
  if (constraints === null) {
    return sourceMedia.length === 0 ? 'complete' : 'incompatible';
  }
  if (constraints.hasUnknownRoles) return 'incompatible';

  const count = sourceMedia.length;
  if (count > constraints.max) return 'incompatible';
  if (
    sourceMedia.some(
      (source) => source.mediaType === null || !constraints.mediaTypes.includes(source.mediaType),
    )
  ) {
    return 'incompatible';
  }

  if (constraints.roles === null) {
    if (sourceMedia.some((source) => source.role !== null)) return 'incompatible';
    return count < constraints.min ? 'incomplete' : 'complete';
  }

  const roles = constraints.roles;
  const seenRoles = new Set<string>();
  for (const source of sourceMedia) {
    if (
      source.role === null ||
      !isMediaSlot(source.role) ||
      !roles.includes(source.role) ||
      seenRoles.has(source.role) ||
      source.mediaType !== mediaKindForSlot(source.role)
    ) {
      return 'incompatible';
    }
    seenRoles.add(source.role);
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
 *    `incomplete`, or `incompatible` against the current sources' own role
 *    assignments. Exactly one `complete` candidate resolves; more than
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
    classification.set(mode, classifyCandidate(constraints, input.sourceMedia));
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
