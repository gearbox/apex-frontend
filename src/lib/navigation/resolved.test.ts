import { describe, expect, it } from 'vitest';
import { PRODUCT_PROFILES } from '$lib/product/profiles';
import { resolveNavigation, navigationRequires } from './resolved';

describe('resolved navigation', () => {
  it('removes gated destinations unless available while preserving slots and order', () => {
    const synthara = PRODUCT_PROFILES.synthara.navigation;
    const available = resolveNavigation(synthara, () => true);
    const unavailable = resolveNavigation(synthara, () => false);

    expect(available.desktopMain).toEqual([
      'studio',
      'artists',
      'create',
      'library',
      'sessions',
      'jobs',
      'billing',
    ]);
    expect(unavailable.desktopMain).toEqual(['create', 'library', 'sessions', 'jobs', 'billing']);
    expect(available.mobileTabs).toEqual([
      { kind: 'destination', id: 'studio' },
      { kind: 'destination', id: 'create' },
      { kind: 'library' },
      { kind: 'more' },
    ]);
    expect(unavailable.mobileTabs).toEqual([
      { kind: 'destination', id: 'create' },
      { kind: 'library' },
      { kind: 'destination', id: 'sessions' },
      { kind: 'more' },
    ]);
    expect(available.moreSheet).toEqual(['artists', 'sessions', 'billing', 'jobs', 'profile']);
    expect(unavailable.moreSheet).toEqual(['billing', 'jobs', 'profile']);
  });

  it('navigationRequires reports whether a profile uses a capability', () => {
    expect(navigationRequires(PRODUCT_PROFILES.synthara.navigation, 'studio')).toBe(true);
    expect(navigationRequires(PRODUCT_PROFILES.vex.navigation, 'studio')).toBe(false);
  });
});
