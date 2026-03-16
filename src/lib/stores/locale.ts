import { writable } from 'svelte/store';
import { setLanguageTag } from '$paraglide/runtime';
import { browser } from '$app/environment';

const SUPPORTED_LOCALES = ['en', 'ru', 'sr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = 'apex-locale';

function detectLocale(): Locale {
  if (!browser) return 'en';
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  const browserLang = navigator.language.split('-')[0] as Locale;
  if (SUPPORTED_LOCALES.includes(browserLang)) return browserLang;
  return 'en';
}

function createLocaleStore() {
  const { subscribe, set } = writable<Locale>(detectLocale());

  function apply(locale: Locale) {
    if (browser) {
      localStorage.setItem(STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    }
    setLanguageTag(locale);
    set(locale);
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
