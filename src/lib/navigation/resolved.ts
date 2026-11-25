import { derived } from 'svelte/store';
import { productProfile } from '$lib/product/profile';
import {
  isCapabilityAvailable,
  studioCapability,
  type Capability,
} from '$lib/product/capabilities';
import { NAV_DESTINATIONS, type NavDestination } from './destinations';
import type { ProductNavigation } from '$lib/product/profiles';

export function resolveNavigation(
  nav: ProductNavigation,
  isAvailable: (capability: Capability) => boolean,
): ProductNavigation {
  const isVisible = (id: keyof typeof NAV_DESTINATIONS) => {
    const requirement = (NAV_DESTINATIONS[id] as NavDestination).requires;
    return requirement === undefined || isAvailable(requirement);
  };
  const moreSheet = nav.moreSheet.filter(isVisible);
  const visibleTabs = nav.mobileTabs.filter(
    (slot) => slot.kind !== 'destination' || isVisible(slot.id),
  );
  const used = new Set(
    visibleTabs.flatMap((slot) =>
      slot.kind === 'destination' ? [slot.id] : slot.kind === 'library' ? ['library'] : [],
    ),
  );
  const missing = nav.mobileTabs.length - visibleTabs.length;
  const promoted = moreSheet.filter((id) => !used.has(id)).slice(0, missing);
  const mobileTabs: Array<ProductNavigation['mobileTabs'][number]> = [];
  for (const slot of visibleTabs) {
    if (slot.kind === 'more')
      mobileTabs.push(...promoted.map((id) => ({ kind: 'destination' as const, id })));
    mobileTabs.push(slot);
  }

  return {
    desktopMain: nav.desktopMain.filter(isVisible),
    mobileTabs,
    moreSheet: moreSheet.filter((id) => !promoted.includes(id)),
  };
}

export function navigationRequires(nav: ProductNavigation, capability: Capability): boolean {
  const ids = [
    ...nav.desktopMain,
    ...nav.moreSheet,
    ...nav.mobileTabs.flatMap((slot) => (slot.kind === 'destination' ? [slot.id] : [])),
  ];
  return ids.some((id) => (NAV_DESTINATIONS[id] as NavDestination).requires === capability);
}

export const navigation = derived([productProfile, studioCapability], ([$profile, $studio]) =>
  resolveNavigation($profile.navigation, (capability) =>
    capability === 'studio' ? isCapabilityAvailable($studio) : false,
  ),
);
