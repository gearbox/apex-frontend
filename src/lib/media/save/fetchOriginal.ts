import { recoverContentAccess } from '$lib/media/contentAccessRecovery';
import {
  fetchProtectedContent,
  parseProtectedContentUrl,
  type ProtectedContentUrl,
} from '$lib/media/protectedContent';
import { SaveFailedError } from './types';
import type { MediaObject, SaveFailedReason } from './types';

/** Saving is not subject to the 25 MB live-decode cap — only to a much larger safety bound. */
export const MAX_SAVE_BYTES = 512 * 1024 * 1024;

function reasonForStatus(status: number): SaveFailedReason {
  if (status === 404) return 'not-found';
  if (status === 401 || status === 403) return 'auth';
  return 'network';
}

async function requestBytes(
  target: ProtectedContentUrl,
  signal: AbortSignal | undefined,
  cacheMode: RequestCache,
): Promise<Response> {
  try {
    return await fetchProtectedContent(target, { signal, cache: cacheMode });
  } catch {
    throw new SaveFailedError('network');
  }
}

/**
 * Fetches the original asset bytes, never a `variants[*]` preview, from the stable content proxy
 * with content-cookie credentials. A URL that is not a protected-content URL is rejected without
 * issuing any request. Originals default to `no-store`; session isolation takes priority over a
 * persistent browser-cache warm.
 */
export async function fetchOriginalBlob(
  media: MediaObject,
  signal?: AbortSignal,
  cacheMode: RequestCache = 'no-store',
): Promise<Blob> {
  const { size_bytes, content_type } = media.original;
  if (size_bytes != null && size_bytes > MAX_SAVE_BYTES) {
    throw new SaveFailedError('too-large');
  }

  const target = parseProtectedContentUrl(media.original.url);
  if (!target) throw new SaveFailedError('not-found');

  let response = await requestBytes(target, signal, cacheMode);

  if (response.status === 401) {
    const recovery = await recoverContentAccess({ signal });
    if (!recovery.ok) {
      // Matches requestBytes(): an outage or a detached caller is a network-class failure.
      const networkClass = ['transient', 'rate_limited', 'aborted'].includes(recovery.reason);
      throw new SaveFailedError(networkClass ? 'network' : 'auth');
    }
    response = await requestBytes(target, signal, cacheMode);
  }

  if (!response.ok) {
    throw new SaveFailedError(reasonForStatus(response.status));
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_SAVE_BYTES) {
    throw new SaveFailedError('too-large');
  }

  let bytes: Blob;
  try {
    bytes = await response.blob();
  } catch {
    throw new SaveFailedError('network');
  }

  return new Blob([bytes], { type: response.headers.get('content-type') ?? content_type });
}
