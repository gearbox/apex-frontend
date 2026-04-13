import { writable, derived } from 'svelte/store';
import { isBrowser } from '$lib/utils/env';
import { STORAGE_KEYS } from '$lib/utils/constants';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const deferredPrompt = writable<BeforeInstallPromptEvent | null>(null);
const installed = writable(false);
const dismissed = writable(
  isBrowser() ? localStorage.getItem(STORAGE_KEYS.PWA_INSTALL_DISMISSED) === 'true' : false,
);

/** True when the browser has offered an install prompt we can trigger. */
export const canInstall = derived(
  [deferredPrompt, installed],
  ([$prompt, $installed]) => $prompt !== null && !$installed,
);

/** True when the first-visit sheet should be shown (not yet dismissed, installable). */
export const shouldShowInstallSheet = derived(
  [canInstall, dismissed],
  ([$canInstall, $dismissed]) => $canInstall && !$dismissed,
);

/** Trigger the native install prompt. Returns true if accepted. */
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

  // Detect if already running as installed PWA
  if (window.matchMedia('(display-mode: standalone)').matches) {
    installed.set(true);
  }

  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    window.removeEventListener('appinstalled', onAppInstalled);
  };
}

// Internal helper — gets current prompt value synchronously
function getCurrentPrompt(): BeforeInstallPromptEvent | null {
  let current: BeforeInstallPromptEvent | null = null;
  deferredPrompt.subscribe((v) => (current = v))();
  return current;
}
