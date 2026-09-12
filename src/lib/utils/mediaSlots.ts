import type { components } from '$lib/api/types';
import * as m from '$paraglide/messages';

export type MediaSlot = components['schemas']['MediaSlot'];
type MediaKind = components['schemas']['MediaKind'];

/**
 * Backend protocol vocabulary: the media kind each named source role
 * represents. This is a closed-vocabulary mapping, not a per-model capability
 * table — whether a given model actually accepts a role is still decided by
 * that model's own advertised `generation_modes[*].source_media.roles`.
 */
const SLOT_MEDIA_KIND: Record<MediaSlot, MediaKind> = {
  reference: 'image',
  first_frame: 'image',
  last_frame: 'image',
  source: 'video',
};

export function mediaKindForSlot(role: MediaSlot): MediaKind {
  return SLOT_MEDIA_KIND[role];
}

/** Type guard against the closed role vocabulary — fails closed on unknown/future runtime values. */
export function isMediaSlot(value: string | null | undefined): value is MediaSlot {
  return value != null && Object.hasOwn(SLOT_MEDIA_KIND, value);
}

export interface RoleFilterResult {
  /** The recognized subset, or `null` when the raw array itself was `null`/`undefined`. */
  roles: MediaSlot[] | null;
  /** Whether the raw array contained any value outside the closed vocabulary. */
  hasUnknownRoles: boolean;
}

/**
 * Parses a raw wire-format role array against the closed vocabulary, once,
 * for every module that reads `source_media.roles` off `ModelInfo`/provider
 * discovery (the resolver, `sourceMediaPolicy`, and capability helpers all
 * need this exact recognized-subset-plus-unknown-flag shape).
 */
export function filterKnownRoles(rawRoles: readonly string[] | null | undefined): RoleFilterResult {
  if (rawRoles == null) return { roles: null, hasUnknownRoles: false };
  return {
    roles: rawRoles.filter(isMediaSlot),
    hasUnknownRoles: rawRoles.some((role) => !isMediaSlot(role)),
  };
}

/**
 * Whole-array role validation shared by every capability/affordance helper
 * that inspects `source_media.roles`. A mode's role array is only ever
 * usable in full: `null`/`undefined` (a roleless/interchangeable contract)
 * and "contains any unknown role" (a future/partially-understood positional
 * contract this frontend cannot safely act on) both yield `null` here, so a
 * caller that only consumes the non-null case never salvages a single known
 * role (e.g. `first_frame`) out of a mode whose sibling role is unknown —
 * the whole mode contributes nothing to role-driven affordances.
 */
export function knownMediaSlots(
  roles: readonly string[] | null | undefined,
): readonly MediaSlot[] | null {
  const filtered = filterKnownRoles(roles);
  return filtered.hasUnknownRoles ? null : filtered.roles;
}

/** Canonical display order for positional slot UI — first/last frame precede the standalone roles. */
export const ROLE_DISPLAY_ORDER: readonly MediaSlot[] = [
  'first_frame',
  'last_frame',
  'reference',
  'source',
];

export function compareRoleDisplayOrder(a: MediaSlot, b: MediaSlot): number {
  return ROLE_DISPLAY_ORDER.indexOf(a) - ROLE_DISPLAY_ORDER.indexOf(b);
}

/** Centralized, translated user-facing label for a named source role. */
export function roleLabel(role: MediaSlot): string {
  switch (role) {
    case 'first_frame':
      return m.source_role_first_frame();
    case 'last_frame':
      return m.source_role_last_frame();
    case 'reference':
      return m.source_role_reference();
    case 'source':
      return m.source_role_source_video();
  }
}
