import { derived, get } from 'svelte/store';
import { currentAuthStatus } from '$lib/stores/auth';
import { productProfile } from './profile';
import { settleCapability, studioCapability, type CapabilityState } from './capabilities';
import type { ProductHome } from './profiles';

export function homeFor(home: ProductHome, state: CapabilityState): string {
  return state === 'available' && home.whenCapable ? home.whenCapable.route : home.route;
}
export const homeHref = derived([productProfile, studioCapability], ([$profile, $studio]) =>
  homeFor($profile.home, $studio),
);
export async function resolveHomeRoute(
  deps: { settle?: typeof settleCapability } = {},
): Promise<string> {
  const home = get(productProfile).home;
  if (!home.whenCapable || get(currentAuthStatus) !== 'authenticated') return home.route;
  return homeFor(home, await (deps.settle ?? settleCapability)(home.whenCapable.capability));
}
