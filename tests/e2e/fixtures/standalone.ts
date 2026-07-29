import type { Page } from '@playwright/test';

/**
 * Emulates only Apex's standalone-mode branches. It does not install a PWA or
 * emulate iOS/Android lifecycle behavior; those checks remain device-manual work.
 */
export async function emulateStandaloneMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);

    window.matchMedia = (query: string): MediaQueryList => {
      const mediaQueryList = nativeMatchMedia(query);
      if (query !== '(display-mode: standalone)' && query !== '(display-mode: fullscreen)') {
        return mediaQueryList;
      }

      return new Proxy(mediaQueryList, {
        get(target, property, receiver) {
          if (property === 'matches') return true;
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };

    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  });
}
