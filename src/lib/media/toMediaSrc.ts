import { API_BASE_URL } from '$lib/utils/constants';

const apiOrigin = new URL(API_BASE_URL).origin;

export function toMediaSrc(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${apiOrigin}${path}`;
}
