import { loadEnv } from 'vite';

/** Build-time product identity: PWA manifest data and the default product for dev headers. */
export const PRODUCT_MANIFESTS = {
  vex: {
    name: 'Vex.pics',
    short_name: 'Vex.pics',
    description: 'AI-powered image and video generation',
    theme_color: '#110f0b',
    background_color: '#110f0b',
  },
  synthara: {
    name: 'Synthara',
    short_name: 'Synthara',
    description: 'Plan, write and visualise releases with your AI artists',
    theme_color: '#0f1117',
    background_color: '#0f1117',
  },
};

/**
 * @param {string | undefined} raw
 * @returns {{ id: keyof typeof PRODUCT_MANIFESTS, manifest: (typeof PRODUCT_MANIFESTS)[keyof typeof PRODUCT_MANIFESTS] }}
 */
export function resolveBuildProduct(raw) {
  const id = raw?.trim() || 'vex';
  if (!Object.hasOwn(PRODUCT_MANIFESTS, id)) {
    throw new Error(
      `Unknown VITE_PRODUCT_ID "${id}". Expected one of: ${Object.keys(PRODUCT_MANIFESTS).join(', ')}.`,
    );
  }
  const knownId = /** @type {keyof typeof PRODUCT_MANIFESTS} */ (id);
  return { id: knownId, manifest: PRODUCT_MANIFESTS[knownId] };
}

/** Resolve using Vite env precedence, including mode-specific files.
 * @param {string} mode
 * @param {string} [envDir]
 */
export function resolveBuildProductForMode(mode, envDir = process.cwd()) {
  return resolveBuildProduct(loadEnv(mode, envDir, 'VITE_').VITE_PRODUCT_ID);
}
