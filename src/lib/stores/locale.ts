import { writable } from 'svelte/store';
import { getLocale, setLocale } from '$paraglide/runtime';
import { browser } from '$app/environment';
import { PARAGLIDE_LOCAL_STORAGE_KEY } from '../../../paraglide.config.js';

const SUPPORTED_LOCALES = ['en', 'ru', 'sr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Compatibility-only key used before Paraglide v2 owned locale persistence.
 * A valid value is migrated once at startup and then removed.
 */
export const LEGACY_LOCALE_STORAGE_KEY = 'apex-locale';

function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && SUPPORTED_LOCALES.includes(value as Locale);
}

function applyToParaglide(nextLocale: Locale): void {
  // `reload: false` is safe here because Apex is a client-rendered SPA with no URL
  // locale strategy. Svelte's keyed layouts rerender translated content reactively.
  setLocale(nextLocale, { reload: false });
}

function syncDocumentLanguage(nextLocale: Locale): void {
  if (browser) document.documentElement.lang = nextLocale;
}

function detectInitialLocale(): Locale {
  if (!browser) return 'en';

  const legacyLocale = localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
  if (isLocale(legacyLocale)) {
    applyToParaglide(legacyLocale);
    // Paraglide's localStorage strategy is synchronous. Keep the old key if storage
    // failed, so a future successful startup can still perform the migration.
    if (localStorage.getItem(PARAGLIDE_LOCAL_STORAGE_KEY) === legacyLocale) {
      localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY);
    }
    syncDocumentLanguage(legacyLocale);
    return legacyLocale;
  }

  // getLocale resolves configured persistence, browser preference, then the base locale.
  // Calling setLocale applies that resolved value before any translated layout renders.
  const runtimeLocale = getLocale();
  const initialLocale = isLocale(runtimeLocale) ? runtimeLocale : 'en';
  applyToParaglide(initialLocale);
  syncDocumentLanguage(initialLocale);
  return initialLocale;
}

function createLocaleStore() {
  const { subscribe, set } = writable<Locale>(detectInitialLocale());

  function apply(nextLocale: Locale) {
    applyToParaglide(nextLocale);
    syncDocumentLanguage(nextLocale);
    set(nextLocale);
  }

  return {
    subscribe,
    /** Set locale locally only (no API call — caller is responsible for persisting). */
    set: apply,
    /** Hydrate from user account data after login. Does not call the API. */
    hydrate(locale: string) {
      const safe = SUPPORTED_LOCALES.includes(locale as Locale) ? (locale as Locale) : 'en';
      apply(safe);
    },
  };
}

export const locale = createLocaleStore();
export { SUPPORTED_LOCALES };
