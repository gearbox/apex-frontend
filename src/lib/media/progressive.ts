import { recoverContentAccess } from '$lib/media/contentAccessRecovery';
import {
  fetchProtectedContent,
  parseProtectedContentUrl,
  type ProtectedContentUrl,
} from '$lib/media/protectedContent';
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

async function requestOriginal(
  target: ProtectedContentUrl,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    // This original is private to the current session. Keep the progressive decoded blob only in
    // memory and never deliberately seed the browser's persistent HTTP cache.
    return await fetchProtectedContent(target, { cache: 'no-store', signal });
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

  // An abort listener registered below never fires for a signal that is already aborted at
  // entry — cancel explicitly on that path instead of leaving the body stream open.
  if (options.signal?.aborted) {
    void reader.cancel().catch(() => undefined);
    throw new DOMException('Aborted', 'AbortError');
  }

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

      received += value.byteLength;
      // A mismatched (or absent) Content-Length must not let the stream grow unbounded.
      if (received > PROGRESSIVE_ORIGINAL_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ProgressiveImageError('request');
      }

      chunks.push(value);
      options.onprogress?.({ received, total });
    }
  } finally {
    options.signal?.removeEventListener('abort', cancel);
  }

  // Blob() copies the bytes referenced by each view — no need to pre-copy them ourselves.
  // The cast sidesteps a too-strict BlobPart type (it excludes SharedArrayBuffer-backed views,
  // which a fetch response body stream never produces).
  return new Blob(chunks as BlobPart[], { type: contentType });
}

/**
 * Streams an image original after the md variant has painted. Requests use the same protected
 * content validation, content-cookie credentials, and one-shot 401 content-access recovery as
 * other protected media paths. A skip returns null so callers keep the responsive preview.
 */
export async function fetchOriginalBytes(
  media: MediaObject,
  options: FetchOriginalBytesOptions = {},
): Promise<Blob | null> {
  if (!shouldUpgradeToOriginal(media)) return null;

  const target = parseProtectedContentUrl(media.original.url);
  if (!target) throw new ProgressiveImageError('request');

  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  let response = await requestOriginal(target, options.signal);
  if (response.status === 401) {
    const recovery = await recoverContentAccess({ signal: options.signal });
    if (!recovery.ok) {
      if (recovery.reason === 'aborted') throw new DOMException('Aborted', 'AbortError');
      throw new ProgressiveImageError(
        recovery.reason === 'transient' || recovery.reason === 'rate_limited'
          ? 'network'
          : 'authentication',
      );
    }
    response = await requestOriginal(target, options.signal);
  }

  if (!response.ok)
    throw new ProgressiveImageError(response.status === 401 ? 'authentication' : 'request');
  return readProgressively(response, media.original.size_bytes, options);
}
