import { silentRefresh } from '$lib/api/auth';
import { validateProtectedMediaUrl } from '$lib/media/loadAuthenticatedMediaBlob';
import { toMediaSrc } from '$lib/media/toMediaSrc';
import { getAccessToken } from '$lib/stores/auth';
import type { components } from '$lib/api/types';

type MediaObject = components['schemas']['MediaObject'];

/** Originals above this threshold stay on the responsive md preview in the viewer. */
export const PROGRESSIVE_ORIGINAL_MAX_BYTES = 50 * 1024 * 1024;

export interface OriginalFetchProgress {
  received: number;
  total: number | null;
}

export interface FetchOriginalBytesOptions {
  signal?: AbortSignal;
  onprogress?: (progress: OriginalFetchProgress) => void;
}

export class ProgressiveImageError extends Error {
  constructor(readonly reason: 'authentication' | 'request' | 'network') {
    super(reason);
    this.name = 'ProgressiveImageError';
  }
}

function largestVariant(media: MediaObject) {
  return media.variants.reduce<(typeof media.variants)[number] | undefined>(
    (largest, variant) => (!largest || variant.width > largest.width ? variant : largest),
    undefined,
  );
}

/** Whether an original has meaningful visual detail beyond the best responsive preview. */
export function shouldUpgradeToOriginal(media: MediaObject): boolean {
  if (media.media_type !== 'image') return false;
  if (
    media.original.size_bytes != null &&
    media.original.size_bytes > PROGRESSIVE_ORIGINAL_MAX_BYTES
  ) {
    return false;
  }

  const largest = largestVariant(media);
  const { width, height } = media.original;
  if (
    largest &&
    width != null &&
    height != null &&
    width <= largest.width &&
    height <= largest.height
  ) {
    return false;
  }
  return true;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (import.meta.env.DEV) headers['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
  return headers;
}

async function requestOriginal(url: string, signal?: AbortSignal): Promise<Response> {
  try {
    // Intentionally omit cache: 'no-store': a completed original should populate the browser
    // HTTP cache, unlike save/share which may need fresh attachment semantics.
    return await fetch(url, { headers: requestHeaders(), credentials: 'include', signal });
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    throw new ProgressiveImageError('network');
  }
}

function progressTotal(response: Response, fallback: number | null | undefined): number | null {
  const header = response.headers.get('content-length');
  if (header && /^\d+$/.test(header)) {
    const value = Number(header);
    if (Number.isSafeInteger(value)) return value;
  }
  return fallback ?? null;
}

async function readProgressively(
  response: Response,
  fallbackSize: number | null | undefined,
  options: FetchOriginalBytesOptions,
): Promise<Blob> {
  const contentType = response.headers.get('content-type') ?? '';
  const reader = response.body?.getReader();
  if (!reader) return response.blob();

  const total = progressTotal(response, fallbackSize);
  const chunks: Uint8Array[] = [];
  let received = 0;
  options.onprogress?.({ received, total });

  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  options.signal?.addEventListener('abort', cancel, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.byteLength;
      options.onprogress?.({ received, total });
    }
  } finally {
    options.signal?.removeEventListener('abort', cancel);
  }

  const parts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  return new Blob(parts, { type: contentType });
}

/**
 * Streams an image original after the md variant has painted. Requests use the same protected
 * content validation, bearer header, cookie credentials, and one-time 401 refresh as other
 * authenticated media paths. A skip returns null so callers keep the responsive preview.
 */
export async function fetchOriginalBytes(
  media: MediaObject,
  options: FetchOriginalBytesOptions = {},
): Promise<Blob | null> {
  if (!shouldUpgradeToOriginal(media)) return null;

  const url = toMediaSrc(media.original.url);
  try {
    validateProtectedMediaUrl(url);
  } catch {
    throw new ProgressiveImageError('request');
  }

  let response = await requestOriginal(url, options.signal);
  if (response.status === 401) {
    let refreshed: boolean;
    try {
      refreshed = await silentRefresh();
    } catch (error) {
      if (isAbort(error, options.signal)) throw error;
      throw new ProgressiveImageError('network');
    }
    if (!refreshed) throw new ProgressiveImageError('authentication');
    response = await requestOriginal(url, options.signal);
  }

  if (!response.ok)
    throw new ProgressiveImageError(response.status === 401 ? 'authentication' : 'request');
  return readProgressively(response, media.original.size_bytes, options);
}
