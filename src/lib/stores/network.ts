import { writable, derived } from 'svelte/store';
import { isBrowser } from '$lib/utils/env';

export type NetworkState = 'online' | 'offline';

const { subscribe, set } = writable<NetworkState>(
  isBrowser() ? (navigator.onLine ? 'online' : 'offline') : 'online',
);

export const networkStatus = { subscribe };

/** True when the browser reports offline. */
export const isOffline = derived({ subscribe }, ($status) => $status === 'offline');

/** Call once from the root layout's onMount. Returns a cleanup function. */
export function initNetworkListener(): () => void {
  if (!isBrowser()) return () => {};

  const goOnline = () => set('online');
  const goOffline = () => set('offline');

  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);

  // Sync initial state
  set(navigator.onLine ? 'online' : 'offline');

  return () => {
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
  };
}
