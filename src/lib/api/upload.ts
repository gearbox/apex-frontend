import { API_BASE_URL } from '$lib/utils/constants';
import { withAuthOperation } from '$lib/api/authedFetch';
import { parseApiError, ApiRequestError } from '$lib/api/errors';
import { parseAssetRef } from '$lib/utils/assetRef';
import type { components } from '$lib/api/types';

export type UploadResponse = components['schemas']['UploadResponse'];

interface FrameLineage {
  sourceAssetRef: string;
  timestampMs: number;
}
interface UploadOptions {
  lineage?: FrameLineage;
  signal?: AbortSignal;
}

async function doUpload(
  file: File,
  token: string | null,
  signal: AbortSignal,
  options: UploadOptions,
): Promise<Response> {
  // Built fresh per attempt — a FormData tied to a previous fetch body cannot be reused.
  const formData = new FormData();
  formData.append('data', file);
  if (options.lineage) {
    formData.append('source_asset_ref', options.lineage.sourceAssetRef);
    formData.append(
      'source_timestamp_ms',
      String(Math.max(0, Math.round(options.lineage.timestampMs))),
    );
  }
  const requestSignal = options.signal ? AbortSignal.any([signal, options.signal]) : signal;
  requestSignal.throwIfAborted();

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (import.meta.env.DEV) {
    headers['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
  }

  return fetch(`${API_BASE_URL}/v1/storage/upload`, {
    method: 'POST',
    headers,
    body: formData,
    signal: requestSignal,
  });
}

/**
 * Upload an image or video file to R2 storage.
 *
 * Uses raw fetch (not openapi-fetch) because openapi-fetch has limited
 * multipart/form-data support. Auth header is injected manually using the
 * same static helpers used by the openapi-fetch middleware. On a 401 (expired
 * access token), attempts a silent refresh and retries once.
 *
 * @param file - The media file to upload (supported images or videos, max 20MB)
 * @returns The upload response with the new media ID
 */
export async function uploadMedia(
  file: File,
  options: UploadOptions = {},
): Promise<UploadResponse> {
  if (options.lineage) {
    parseAssetRef(options.lineage.sourceAssetRef);
    if (!Number.isFinite(options.lineage.timestampMs)) throw new Error('invalid_frame_lineage');
  }
  options.signal?.throwIfAborted();
  return withAuthOperation(
    (token, signal) => doUpload(file, token, signal, options),
    async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiRequestError(parseApiError(body, res.status));
      }

      const result = (await res.json()) as UploadResponse;
      options.signal?.throwIfAborted();
      return result;
    },
  );
}
