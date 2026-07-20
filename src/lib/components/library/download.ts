import { getAccessToken } from '$lib/stores/auth';
import { API_BASE_URL } from '$lib/utils/constants';
import { ApiRequestError } from '$lib/api/errors';
import type { components } from '$lib/api/types';

type MediaObject = components['schemas']['MediaObject'];

const mimeToExt: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/** Fetches the original media asset and triggers a browser download of it. */
export async function downloadLibraryMedia(
  media: MediaObject,
  filenameStem: string,
): Promise<void> {
  const token = getAccessToken();
  const absoluteUrl = `${API_BASE_URL}${media.original.url}`;
  const response = await fetch(absoluteUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new ApiRequestError({
      error: 'download_failed',
      message: `Download failed (${response.status})`,
      status_code: response.status,
    });
  }

  const blob = await response.blob();
  const ext =
    mimeToExt[media.original.content_type] ?? (media.media_type === 'video' ? 'mp4' : 'jpg');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filenameStem}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
