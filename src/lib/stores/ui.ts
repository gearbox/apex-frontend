import { writable } from 'svelte/store';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { isBrowser } from '$lib/utils/env';

/* ─── Sidebar ─── */
function loadSidebarCollapsed(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED) === 'true';
}

export const sidebarCollapsed = writable(loadSidebarCollapsed());

export function toggleSidebar(): void {
  sidebarCollapsed.update((v) => {
    const next = !v;
    if (isBrowser()) localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(next));
    return next;
  });
}

/* ─── Mobile More Sheet ─── */
export const moreSheetOpen = writable(false);

export function openMoreSheet(): void {
  moreSheetOpen.set(true);
}

export function closeMoreSheet(): void {
  moreSheetOpen.set(false);
}
