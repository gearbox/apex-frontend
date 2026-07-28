import { API_BASE_URL } from '$lib/utils/constants';
import { withAuthOperation } from '$lib/api/authedFetch';
import { parseApiError, ApiRequestError } from '$lib/api/errors';
import type { components } from '$lib/api/types';

type UploadResponse = components['schemas']['UploadResponse'];

async function doUpload(file: File, token: string | null, signal: AbortSignal): Promise<Response> {
  // Built fresh per attempt — a FormData tied to a previous fetch body cannot be reused.
  const formData = new FormData();
  formData.append('data', file);

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (import.meta.env.DEV) {
    headers['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
  }

  return fetch(`${API_BASE_URL}/v1/storage/upload`, {
    method: 'POST',
    headers,
    body: formData,
    signal,
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
export async function uploadMedia(file: File): Promise<UploadResponse> {
  return withAuthOperation(
    (token, signal) => doUpload(file, token, signal),
    async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiRequestError(parseApiError(body, res.status));
      }

      return (await res.json()) as UploadResponse;
    },
  );
}
