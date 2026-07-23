import { toMediaSrc } from '$lib/media/toMediaSrc';
import { fetchOriginalBlob } from './fetchOriginal';
import { buildSaveFilename } from './filename';
import { resolveSaveCapabilities } from './capabilities';
import { get as getCachedBlob, set as setCachedBlob } from './blobCache';
import { shareFile, downloadBlob } from './savers';
import { SaveFailedError } from './types';
import type { MediaObject, SaveCapability, SaveMediaDeps, SaveOutcome } from './types';

const defaultDeps: SaveMediaDeps = {
  fetchBlob: fetchOriginalBlob,
  share: shareFile,
  download: downloadBlob,
  now: () => Date.now(),
};

/** Orchestrates a save: resolves the filename, serves the 60s blob cache on a miss-free retry, then shares or downloads. */
export async function saveMedia(
  mode: SaveCapability,
  media: MediaObject,
  id: string,
  deps: Partial<SaveMediaDeps> = {},
): Promise<SaveOutcome> {
  const { fetchBlob, share, download, now } = { ...defaultDeps, ...deps };

  const filename = buildSaveFilename(id, media);
  const cacheKey = toMediaSrc(media.original.url);
  const timestamp = now();

  let blob = getCachedBlob(cacheKey, timestamp);
  if (!blob) {
    blob = await fetchBlob(media);
    setCachedBlob(cacheKey, blob, timestamp);
  }

  if (mode === 'download') {
    return download(blob, filename);
  }

  const file = new File([blob], filename, { type: blob.type });
  try {
    return await share(file);
  } catch (error) {
    if (
      error instanceof SaveFailedError &&
      error.reason === 'unsupported' &&
      resolveSaveCapabilities().includes('download')
    ) {
      return download(blob, filename);
    }
    throw error;
  }
}
