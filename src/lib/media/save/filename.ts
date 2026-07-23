import type { MediaObject } from './types';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** Falls back by `media_type` when the content type is unrecognized. */
export function extensionForMedia(media: MediaObject): string {
  return MIME_TO_EXT[media.original.content_type] ?? (media.media_type === 'video' ? 'mp4' : 'jpg');
}

/** `<uuid>.<ext>` — deliberately no `apex-` prefix. */
export function buildSaveFilename(id: string, media: MediaObject): string {
  const safeId = id.replace(/[^A-Za-z0-9._-]/g, '');
  return `${safeId}.${extensionForMedia(media)}`;
}
