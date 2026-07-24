import { getInstallPlatform } from '$lib/utils/platform';
import { isBrowser } from '$lib/utils/env';
import type { SaveCapability } from './types';

export interface SaveEnv {
  /** iOS/iPadOS — WebKit does not honour the `download` attribute on blob: URLs. */
  isApple: boolean;
  coarsePointer: boolean;
  canShareFiles: boolean;
  anchorDownload: boolean;
}

function probeCanShareFiles(): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const probe = new File([new Blob([], { type: 'image/jpeg' })], 'probe.jpg', {
      type: 'image/jpeg',
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Reads the real environment. SSR (no browser) resolves to the safe, download-only default. */
export function readSaveEnv(): SaveEnv {
  if (!isBrowser()) {
    return { isApple: false, coarsePointer: false, canShareFiles: false, anchorDownload: true };
  }

  return {
    isApple: getInstallPlatform() === 'ios',
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    canShareFiles: probeCanShareFiles(),
    anchorDownload: 'download' in HTMLAnchorElement.prototype,
  };
}

/**
 * Pure policy: which save actions to surface for the given environment.
 * `share` is intentionally not plain feature detection — WebKit reports `download`
 * support while behaving incorrectly on blob: URLs, so Apple is excluded explicitly.
 */
export function resolveSaveCapabilities(env: SaveEnv = readSaveEnv()): SaveCapability[] {
  const capabilities: SaveCapability[] = [];

  if (env.coarsePointer && env.canShareFiles) capabilities.push('share');
  if (env.anchorDownload && !env.isApple) capabilities.push('download');

  return capabilities.length > 0 ? capabilities : ['download'];
}
