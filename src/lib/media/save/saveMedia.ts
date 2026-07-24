import { toMediaSrc } from '$lib/media/toMediaSrc';
import { fetchOriginalBlob } from './fetchOriginal';
import { buildSaveFilename } from './filename';
import { resolveSaveCapabilities } from './capabilities';
import { getCachedBlob, setCachedBlob } from './blobCache';
import { shareFile, downloadBlob } from './savers';
import { SaveFailedError } from './types';
import type { MediaObject, SaveCapability, SaveMediaDeps, SaveOutcome } from './types';

const defaultDeps: SaveMediaDeps = {
  fetchBlob: fetchOriginalBlob,
  share: shareFile,
  download: downloadBlob,
  now: () => Date.now(),
  capabilities: resolveSaveCapabilities,
};

/** Orchestrates a save: resolves the filename, serves the 60s blob cache on a miss-free retry, then shares or downloads. */
export async function saveMedia(
  mode: SaveCapability,
  media: MediaObject,
  id: string,
  deps: Partial<SaveMediaDeps> = {},
): Promise<SaveOutcome> {
  const { fetchBlob, share, download, now, capabilities } = { ...defaultDeps, ...deps };

  const filename = buildSaveFilename(id, media);
  const cacheKey = toMediaSrc(media.original.url);

  let blob = getCachedBlob(cacheKey, now());
  if (!blob) {
    blob = await fetchBlob(media);
    setCachedBlob(cacheKey, blob, now());
  }

  if (mode === 'download') {
    return download(blob, filename);
  }

  const type = blob.type || media.original.content_type || 'application/octet-stream';
  const file = new File([blob], filename, { type });
  try {
    return await share(file);
  } catch (error) {
    if (
      error instanceof SaveFailedError &&
      error.reason === 'unsupported' &&
      capabilities().includes('download')
    ) {
      return download(blob, filename);
    }
    throw error;
  }
}
