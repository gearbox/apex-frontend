import { describe, expect, it } from 'vitest';
import { PRODUCT_PROFILES } from './profiles';
import { NAV_DESTINATIONS } from '$lib/navigation/destinations';
describe('product profiles', () => {
  it('has valid identity, routes and navigation slots', () => {
    for (const [id, profile] of Object.entries(PRODUCT_PROFILES)) {
      expect(profile.id).toBe(id);
      expect(profile.homeRoute).toMatch(/^\/app\//);
      const { desktopMain, mobileTabs, moreSheet } = profile.navigation;
      for (const destination of [
        ...desktopMain,
        ...moreSheet,
        ...mobileTabs.flatMap((slot) => (slot.kind === 'destination' ? [slot.id] : [])),
      ]) {
        expect(Object.hasOwn(NAV_DESTINATIONS, destination)).toBe(true);
      }
      expect(mobileTabs.filter((slot) => slot.kind === 'more')).toHaveLength(1);
      expect(mobileTabs.at(-1)?.kind).toBe('more');
      expect(mobileTabs.filter((slot) => slot.kind === 'library').length).toBeLessThanOrEqual(1);
    }
  });
  it('preserves generator navigation and home for both products', () => {
    for (const profile of Object.values(PRODUCT_PROFILES)) {
      expect(profile.homeRoute).toBe('/app/create');
      expect(profile.navigation.desktopMain).toEqual([
        'create',
        'library',
        'sessions',
        'jobs',
        'billing',
      ]);
      expect(profile.navigation.mobileTabs).toEqual([
        { kind: 'destination', id: 'create' },
        { kind: 'destination', id: 'sessions' },
        { kind: 'library' },
        { kind: 'more' },
      ]);
      expect(profile.navigation.moreSheet).toEqual(['billing', 'jobs', 'profile']);
    }
  });
});
