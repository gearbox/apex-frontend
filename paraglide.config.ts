import type { ParaglideVitePluginOptions } from '@inlang/paraglide-js';
import { PARAGLIDE_LOCAL_STORAGE_KEY } from './src/lib/i18n/constants';

/** The single Paraglide configuration shared by development, test, and production builds. */
export { PARAGLIDE_LOCAL_STORAGE_KEY } from './src/lib/i18n/constants';

export const paraglideConfig = {
  project: './project.inlang',
  outdir: './src/paraglide',
  emitTsDeclarations: true,
  // Apex is a fully client-rendered SPA. Locale changes are reactive and never change the URL.
  strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
  localStorageKey: PARAGLIDE_LOCAL_STORAGE_KEY,
} satisfies ParaglideVitePluginOptions;
