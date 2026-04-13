import { isBrowser } from '$lib/utils/env';

export type InstallPlatform = 'ios' | 'chromium' | 'other';

/** Detect whether we're on iOS Safari, a Chromium browser, or something else. */
export function getInstallPlatform(): InstallPlatform {
  if (!isBrowser()) return 'other';

  const ua = navigator.userAgent;

  // iOS detection: iPhone/iPad/iPod, or macOS with touch (iPad on iOS 13+)
  const isIOS =
    /iP(hone|od|ad)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) return 'ios';

  // Chromium-based browsers support beforeinstallprompt
  // Check for Chrome, Edge, Samsung Browser, Opera (but not iOS Chrome/Firefox which have WebKit)
  if ('BeforeInstallPromptEvent' in window || /Chrome|Chromium|Edg|SamsungBrowser|OPR/.test(ua)) {
    return 'chromium';
  }

  return 'other';
}

/** True when running as an installed PWA (standalone / fullscreen). */
export function isStandalone(): boolean {
  if (!isBrowser()) return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as Record<string, unknown>).standalone === true)
  );
}
