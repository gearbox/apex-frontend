import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
);

/** Human-readable app version from package.json, e.g. "0.4.1". */
export const APP_VERSION = pkg.version;

/**
 * Short commit SHA of the current build.
 * Cloudflare Pages injects CF_PAGES_COMMIT_SHA automatically during builds.
 * Falls back to "dev" for local builds / previews.
 */
export const BUILD_SHA = (process.env.CF_PAGES_COMMIT_SHA ?? 'dev').slice(0, 7);
