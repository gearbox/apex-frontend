import type { components } from '$lib/api/types';
import type { SourceMediaDraft } from '$lib/stores/generation';
import { mediaKindForSlot, type MediaSlot } from './mediaSlots';

type ModelInfo = components['schemas']['ModelInfo'];

/**
 * The user-triggered intent behind a source selection. `interchangeable` is
 * the generic "Add reference"-style action (legal only against a
 * `roles: null` candidate); `role` names the exact positional slot the user
 * explicitly chose (e.g. clicking "Add last frame").
 */
export type SourceSelectionIntent =
  { kind: 'interchangeable'; mediaKind: string } | { kind: 'role'; role: MediaSlot };

export type RoleSelectionPlan =
  | {
      allowed: true;
      /** Existing draft indices that must be promoted to a named role before the new source is appended. */
      promote: Array<{ index: number; role: MediaSlot }>;
      /** The role the newly-added source itself should carry. */
      role: MediaSlot;
    }
  | { allowed: false; reason: 'occupied' | 'incompatible' | 'ambiguous' };

interface RoleCandidate {
  roles: readonly MediaSlot[];
}

function roleCandidatesFor(
  modelInfo: ModelInfo | null | undefined,
  role: MediaSlot,
): RoleCandidate[] {
  const candidates: RoleCandidate[] = [];
  for (const modeInfo of Object.values(modelInfo?.generation_modes ?? {})) {
    const roles = modeInfo?.source_media?.roles;
    if (roles != null && roles.includes(role)) candidates.push({ roles });
  }
  return candidates;
}

function planKey(promote: Array<{ index: number; role: MediaSlot }>): string {
  return [...promote]
    .sort((a, b) => a.index - b.index)
    .map((p) => `${p.index}:${p.role}`)
    .join(',');
}

/** All ways to injectively map `free` draft indices onto `remainingRoles`, respecting media kind. */
function bijections(
  free: Array<{ index: number; mediaType: string | null }>,
  remainingRoles: readonly MediaSlot[],
): Array<Array<{ index: number; role: MediaSlot }>> {
  if (free.length === 0) return [[]];
  if (free.length > remainingRoles.length) return [];

  const [head, ...rest] = free;
  const results: Array<Array<{ index: number; role: MediaSlot }>> = [];
  for (let i = 0; i < remainingRoles.length; i++) {
    const role = remainingRoles[i];
    if (head.mediaType !== mediaKindForSlot(role)) continue;
    const remaining = [...remainingRoles.slice(0, i), ...remainingRoles.slice(i + 1)];
    for (const tail of bijections(rest, remaining)) {
      results.push([{ index: head.index, role }, ...tail]);
    }
  }
  return results;
}

/**
 * Determines the legal, deterministic draft transition for a user-triggered
 * source-selection intent. This is the sole place production code decides
 * how an existing *generic* source may be promoted into a named role to
 * combine with a newly-selected one — the resolver only ever classifies an
 * already-fixed draft, it never mutates or guesses one into shape.
 *
 * Safety invariants:
 * - never reassigns a source that already carries an explicit role;
 * - never assigns one source to more than one role, or drops a source;
 * - only offers a plan when the resulting assignment is the *unique* legal
 *   one — if more than one distinct promotion would work, or no candidate
 *   mode can accommodate every currently-generic source, no plan is offered.
 */
export function planRoleSelection(
  modelInfo: ModelInfo | null | undefined,
  currentSources: readonly SourceMediaDraft[],
  role: MediaSlot,
): RoleSelectionPlan {
  if (currentSources.some((source) => source.role === role)) {
    return { allowed: false, reason: 'occupied' };
  }

  const fixedRoles = new Set(
    currentSources
      .filter((s): s is SourceMediaDraft & { role: MediaSlot } => s.role !== null)
      .map((s) => s.role),
  );
  const free = currentSources
    .map((source, index) => ({ index, mediaType: source.mediaType, role: source.role }))
    .filter((source) => source.role === null);

  const plans = new Map<string, Array<{ index: number; role: MediaSlot }>>();
  let sawCompatibleCandidate = false;

  for (const candidate of roleCandidatesFor(modelInfo, role)) {
    // Every already-fixed role must belong to this candidate, or it can never
    // accommodate the current draft regardless of how free sources are placed.
    if ([...fixedRoles].some((fixed) => !candidate.roles.includes(fixed))) continue;

    const remainingRoles = candidate.roles.filter((r) => r !== role && !fixedRoles.has(r));
    for (const mapping of bijections(free, remainingRoles)) {
      sawCompatibleCandidate = true;
      plans.set(planKey(mapping), mapping);
    }
  }

  if (plans.size === 0) {
    return { allowed: false, reason: sawCompatibleCandidate ? 'ambiguous' : 'incompatible' };
  }
  if (plans.size > 1) {
    return { allowed: false, reason: 'ambiguous' };
  }

  const [promote] = plans.values();
  return { allowed: true, promote, role };
}
