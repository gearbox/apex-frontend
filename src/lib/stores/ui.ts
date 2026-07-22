import { derived, writable } from 'svelte/store';
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

/* ─── Mobile navigation sheets ─── */
export type MobileNavSheet = 'projects' | 'more' | null;

/** One authoritative drawer state prevents competing backdrops and focus locks. */
export const mobileNavSheet = writable<MobileNavSheet>(null);

export const projectsSheetOpen = derived(mobileNavSheet, (sheet) => sheet === 'projects');
export const moreSheetOpen = derived(mobileNavSheet, (sheet) => sheet === 'more');

export function openProjectsSheet(): void {
  mobileNavSheet.set('projects');
}

export function openMoreSheet(): void {
  mobileNavSheet.set('more');
}

export function closeMobileNavSheet(): void {
  mobileNavSheet.set(null);
}

export function closeMoreSheet(): void {
  closeMobileNavSheet();
}
