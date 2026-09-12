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
