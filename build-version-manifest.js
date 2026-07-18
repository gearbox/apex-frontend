/** @typedef {{ version: string; buildSha: string; builtAt: string }} AppVersionManifest */

/**
 * The public version manifest is emitted by Vite for every production build.
 * Keeping the payload creation here lets the build and tests use the exact
 * same metadata source as the compile-time application constants.
 */
/** @param {AppVersionManifest} metadata @returns {AppVersionManifest} */
export function createAppVersionManifest({ version, buildSha, builtAt }) {
  return {
    version,
    buildSha,
    builtAt,
  };
}

/** @param {{ version: string; buildSha: string }} metadata @returns {import('vite').Plugin} */
export function appVersionManifestPlugin({ version, buildSha }) {
  return {
    name: 'apex-app-version-manifest',
    apply: 'build',
    generateBundle() {
      const manifest = createAppVersionManifest({
        version,
        buildSha,
        builtAt: new Date().toISOString(),
      });

      this.emitFile({
        type: 'asset',
        fileName: 'app-version.json',
        source: `${JSON.stringify(manifest)}\n`,
      });
    },
  };
}
