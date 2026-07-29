import type { ParaglideVitePluginOptions } from '@inlang/paraglide-js';

/** The single Paraglide configuration shared by development, test, and production builds. */
export const PARAGLIDE_LOCAL_STORAGE_KEY = 'PARAGLIDE_LOCALE';

export const paraglideConfig = {
  project: './project.inlang',
  outdir: './src/paraglide',
  emitTsDeclarations: true,
  // Apex is a fully client-rendered SPA. Locale changes are reactive and never change the URL.
  strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
  localStorageKey: PARAGLIDE_LOCAL_STORAGE_KEY,
} satisfies ParaglideVitePluginOptions;
