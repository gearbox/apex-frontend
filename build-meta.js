import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
);

/** Human-readable app version from package.json, e.g. "0.4.1". */
export const APP_VERSION = pkg.version;

/**
 * Short commit SHA of the current build.
 * Cloudflare Workers Builds (current deploy pipeline) injects WORKERS_CI_COMMIT_SHA.
 * CF_PAGES_COMMIT_SHA is kept for compatibility with classic Cloudflare Pages CI,
 * and GITHUB_SHA in case this is ever built via GitHub Actions.
 * Falls back to "dev" for local builds / previews.
 */
export const BUILD_SHA = (
  process.env.WORKERS_CI_COMMIT_SHA || // Cloudflare Workers Builds (current deploy pipeline)
  process.env.CF_PAGES_COMMIT_SHA || // classic Cloudflare Pages CI (kept for compatibility)
  process.env.GITHUB_SHA || // GitHub Actions, if ever built there
  'dev'
) // local builds / previews
  .slice(0, 7);
