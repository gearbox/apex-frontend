import { describe, expect, it } from 'vitest';
import {
  compareRoleDisplayOrder,
  isMediaSlot,
  knownMediaSlots,
  mediaKindForSlot,
  ROLE_DISPLAY_ORDER,
  roleLabel,
  type MediaSlot,
} from './mediaSlots';

describe('mediaKindForSlot', () => {
  it('maps every known role to its protocol-fixed media kind exhaustively', () => {
    expect(mediaKindForSlot('reference')).toBe('image');
    expect(mediaKindForSlot('first_frame')).toBe('image');
    expect(mediaKindForSlot('last_frame')).toBe('image');
    expect(mediaKindForSlot('source')).toBe('video');
  });
});

describe('isMediaSlot', () => {
  it('accepts every known role', () => {
    for (const role of ['reference', 'first_frame', 'last_frame', 'source'] as const) {
      expect(isMediaSlot(role)).toBe(true);
    }
  });

  it('fails closed on unknown, null, or undefined values', () => {
    expect(isMediaSlot('middle_frame')).toBe(false);
    expect(isMediaSlot(null)).toBe(false);
    expect(isMediaSlot(undefined)).toBe(false);
    expect(isMediaSlot('')).toBe(false);
  });
});

describe('ROLE_DISPLAY_ORDER / compareRoleDisplayOrder', () => {
  it('orders first frame before last frame', () => {
    const roles: MediaSlot[] = ['last_frame', 'first_frame'];
    expect([...roles].sort(compareRoleDisplayOrder)).toEqual(['first_frame', 'last_frame']);
  });

  it('contains every known role exactly once', () => {
    expect(new Set(ROLE_DISPLAY_ORDER).size).toBe(ROLE_DISPLAY_ORDER.length);
    for (const role of ['reference', 'first_frame', 'last_frame', 'source'] as const) {
      expect(ROLE_DISPLAY_ORDER).toContain(role);
    }
  });
});

describe('knownMediaSlots', () => {
  it('returns null for a null/undefined role array (roleless/interchangeable contract)', () => {
    expect(knownMediaSlots(null)).toBeNull();
    expect(knownMediaSlots(undefined)).toBeNull();
  });

  it('returns the typed array when every role is known', () => {
    expect(knownMediaSlots(['first_frame', 'last_frame'])).toEqual(['first_frame', 'last_frame']);
  });

  it('fails closed to null when any role in the array is unknown, even alongside known ones', () => {
    expect(knownMediaSlots(['first_frame', 'future_magic_slot'])).toBeNull();
    expect(knownMediaSlots(['future_magic_slot'])).toBeNull();
  });
});

describe('roleLabel', () => {
  it('returns a distinct, non-empty label for every known role', () => {
    const labels = (['reference', 'first_frame', 'last_frame', 'source'] as const).map(roleLabel);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });
});
