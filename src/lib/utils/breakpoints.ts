import { readable } from 'svelte/store';
import { BREAKPOINT_MD } from '$lib/utils/constants';
import { isBrowser } from '$lib/utils/env';

/** Reactive store that tracks whether the viewport is desktop-sized. */
export const isDesktop = readable(false, (set) => {
  if (!isBrowser()) return;

  const mql = window.matchMedia(`(min-width: ${BREAKPOINT_MD}px)`);
  set(mql.matches);

  const onChange = (e: MediaQueryListEvent) => set(e.matches);
  mql.addEventListener('change', onChange);

  return () => mql.removeEventListener('change', onChange);
});
