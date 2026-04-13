import { writable, derived, readable } from 'svelte/store';
import { isBrowser } from '$lib/utils/env';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { getInstallPlatform, isStandalone, type InstallPlatform } from '$lib/utils/platform';

/* ─── Types ─── */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/* ─── Internal State ─── */

const deferredPrompt = writable<BeforeInstallPromptEvent | null>(null);
const installed = writable(isBrowser() ? isStandalone() : false);
const dismissed = writable(
  isBrowser() ? localStorage.getItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED) === 'true' : false,
);

/* ─── Public Stores ─── */

/** The platform type for install UX branching. */
export const installPlatform = readable<InstallPlatform>(
  isBrowser() ? getInstallPlatform() : 'other',
);

/** True when the app is running as an installed PWA (any platform). */
export const isAppInstalled = { subscribe: installed.subscribe };

/** True when the Chromium browser has offered an install prompt we can trigger. */
export const canInstall = derived(
  [deferredPrompt, installed],
  ([$prompt, $installed]) => $prompt !== null && !$installed,
);

/**
 * True when the install button should be shown in the Profile page.
 * Shows for both iOS (always, until installed) and Chromium (when prompt available).
 */
export const shouldShowInstallButton = derived(
  [installPlatform, installed, canInstall],
  ([$platform, $installed, $canInstall]) => {
    if ($installed) return false;
    if ($platform === 'ios') return true;
    if ($platform === 'chromium') return $canInstall;
    return false;
  },
);

/**
 * True when the first-visit install sheet should be shown.
 * Shows for both iOS (not dismissed, not installed) and Chromium (has prompt, not dismissed).
 */
export const shouldShowInstallSheet = derived(
  [shouldShowInstallButton, dismissed],
  ([$shouldShow, $dismissed]) => $shouldShow && !$dismissed,
);

/* ─── Actions ─── */

/** Trigger the native Chromium install prompt. Returns true if accepted. No-op on iOS. */
export async function triggerInstall(): Promise<boolean> {
  const prompt = getCurrentPrompt();
  if (!prompt) return false;

  await prompt.prompt();
  const { outcome } = await prompt.userChoice;

  if (outcome === 'accepted') {
    installed.set(true);
    deferredPrompt.set(null);
  }
  return outcome === 'accepted';
}

/** Dismiss the install sheet (persisted to localStorage). */
export function dismissInstallSheet(): void {
  dismissed.set(true);
  if (isBrowser()) {
    localStorage.setItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED, 'true');
  }
}

/** Call once from root layout onMount. Returns cleanup. */
export function initPwaInstallListener(): () => void {
  if (!isBrowser()) return () => {};

  const onBeforeInstall = (e: Event) => {
    e.preventDefault();
    deferredPrompt.set(e as BeforeInstallPromptEvent);
  };

  const onAppInstalled = () => {
    installed.set(true);
    deferredPrompt.set(null);
  };

  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onAppInstalled);

  // Listen for display-mode changes (e.g. user installs while page is open)
  const mql = window.matchMedia('(display-mode: standalone)');
  const onDisplayModeChange = (e: MediaQueryListEvent) => {
    if (e.matches) installed.set(true);
  };
  mql.addEventListener('change', onDisplayModeChange);

  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    window.removeEventListener('appinstalled', onAppInstalled);
    mql.removeEventListener('change', onDisplayModeChange);
  };
}

/* ─── Internal Helpers ─── */

function getCurrentPrompt(): BeforeInstallPromptEvent | null {
  let current: BeforeInstallPromptEvent | null = null;
  deferredPrompt.subscribe((v) => (current = v))();
  return current;
}
