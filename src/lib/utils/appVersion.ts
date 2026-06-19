/** Semantic version from package.json, e.g. "0.4.1". */
export const APP_VERSION: string = __APP_VERSION__;

/** Short commit SHA of the deployed build, e.g. "a1b2c3d" ("dev" locally). */
export const BUILD_SHA: string = __BUILD_SHA__;

/** Display label combining version and build, e.g. "v0.4.1 · a1b2c3d". */
export const APP_VERSION_LABEL = `v${APP_VERSION} · ${BUILD_SHA}`;
