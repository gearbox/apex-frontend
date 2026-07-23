import { silentRefresh } from '$lib/api/auth';
import { getAccessToken } from '$lib/stores/auth';
import { toMediaSrc } from '$lib/media/toMediaSrc';
import { validateProtectedMediaUrl } from '$lib/media/loadAuthenticatedMediaBlob';
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
  url: string,
  authenticated: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (authenticated) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (import.meta.env.DEV) {
      headers['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
    }
  }

  try {
    return await fetch(url, { headers, credentials: 'include', cache: 'no-store', signal });
  } catch {
    throw new SaveFailedError('network');
  }
}

/** Fetches the original asset bytes, never a `variants[*]` preview. */
export async function fetchOriginalBlob(media: MediaObject, signal?: AbortSignal): Promise<Blob> {
  const { size_bytes, content_type } = media.original;
  if (size_bytes != null && size_bytes > MAX_SAVE_BYTES) {
    throw new SaveFailedError('too-large');
  }

  const absoluteUrl = toMediaSrc(media.original.url);

  let authenticated: boolean;
  try {
    validateProtectedMediaUrl(absoluteUrl);
    authenticated = true;
  } catch {
    authenticated = false;
  }

  let response = await requestBytes(absoluteUrl, authenticated, signal);

  if (authenticated && response.status === 401) {
    const refreshed = await silentRefresh().catch(() => false);
    if (!refreshed) throw new SaveFailedError('auth');
    response = await requestBytes(absoluteUrl, authenticated, signal);
  }

  if (!response.ok) {
    throw new SaveFailedError(reasonForStatus(response.status));
  }

  let bytes: Blob;
  try {
    bytes = await response.blob();
  } catch {
    throw new SaveFailedError('network');
  }

  return new Blob([bytes], { type: response.headers.get('content-type') ?? content_type });
}
