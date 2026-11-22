import { describe, expect, it } from 'vitest';
import { PRODUCT_PROFILES } from './profiles';
import { NAV_DESTINATIONS } from '$lib/navigation/destinations';
import { resolveNavigation } from '$lib/navigation/resolved';
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
  it('preserves Vex navigation and home', () => {
    const profile = PRODUCT_PROFILES.vex;
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
  });

  it.each(Object.entries(PRODUCT_PROFILES))(
    '%s keeps bounded mobile navigation and desktop reachability in both capability states',
    (_id, profile) => {
      for (const available of [true, false]) {
        const navigation = resolveNavigation(profile.navigation, () => available);
        expect(navigation.mobileTabs.length).toBeLessThanOrEqual(5);
        expect(navigation.mobileTabs.filter((slot) => slot.kind === 'more')).toHaveLength(1);
        expect(navigation.mobileTabs.at(-1)?.kind).toBe('more');

        const mobileDestinations = new Set([
          ...navigation.moreSheet,
          ...navigation.mobileTabs.flatMap((slot) =>
            slot.kind === 'destination' ? [slot.id] : slot.kind === 'library' ? ['library'] : [],
          ),
        ]);
        for (const destination of navigation.desktopMain) {
          if (destination === 'admin' || destination === 'profile') continue;
          expect(mobileDestinations.has(destination)).toBe(true);
        }
      }
    },
  );

  it('uses the expected Synthara navigation and Nocturne default', () => {
    const profile = PRODUCT_PROFILES.synthara;
    expect(profile.defaultTheme).toBe('nocturne');
    expect(profile.navigation).toEqual({
      desktopMain: ['artists', 'create', 'library', 'sessions', 'jobs', 'billing'],
      mobileTabs: [
        { kind: 'destination', id: 'create' },
        { kind: 'destination', id: 'artists' },
        { kind: 'library' },
        { kind: 'more' },
      ],
      moreSheet: ['sessions', 'billing', 'jobs', 'profile'],
    });
  });
});
