import { silentRefresh } from '$lib/api/auth';
import { getAccessToken } from '$lib/stores/auth';
import { ACCEPTED_VIDEO_TYPES } from '$lib/utils/constants';
import { toMediaSrc } from '$lib/media/toMediaSrc';

export type FrameMediaSource = 'output' | 'upload' | 'unknown';
export type FrameMediaFailureCategory =
  | 'authentication'
  | 'forbidden'
  | 'not-found'
  | 'server'
  | 'request'
  | 'invalid-content-type'
  | 'network'
  | 'aborted';

interface FrameMediaDiagnostic {
  source: FrameMediaSource;
  status?: number;
  stage?: 'request' | 'response' | 'blob';
  retryAttempted?: boolean;
}

export interface AuthenticatedMediaBlob {
  objectUrl: string;
  contentType: string;
}

export interface LoadAuthenticatedMediaBlobOptions {
  signal?: AbortSignal;
}

/**
 * Deliberately contains only safe diagnostic fields. In particular, do not add
 * a URL or Authorization value here: both can be sensitive in other callers.
 */
function frameMediaDiagnostic(event: string, details: FrameMediaDiagnostic): void {
  console.debug(event, details);
}

function sourceForUrl(url: string): FrameMediaSource {
  try {
    const pathname = new URL(url).pathname;
    if (pathname.includes('/v1/content/outputs/')) return 'output';
    if (pathname.includes('/v1/content/uploads/')) return 'upload';
  } catch {
    // `toMediaSrc` normally resolves every content path to an absolute URL.
  }
  return 'unknown';
}

function categoryForStatus(status: number): FrameMediaFailureCategory {
  if (status === 401) return 'authentication';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status >= 500) return 'server';
  return 'request';
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');
}

function throwIfAborted(
  signal: AbortSignal | undefined,
  source: FrameMediaSource,
  retryAttempted: boolean,
): void {
  if (signal?.aborted) {
    frameMediaDiagnostic('frame_media.load_aborted', { source, stage: 'request', retryAttempted });
    throw new AuthenticatedMediaLoadError('aborted', null, retryAttempted);
  }
}

/**
 * A safe error contract for the frame-preview UI. Browser/fetch exception text
 * and protected content URLs intentionally never reach the user or logs.
 */
export class AuthenticatedMediaLoadError extends Error {
  constructor(
    readonly category: FrameMediaFailureCategory,
    readonly status: number | null = null,
    readonly retryAttempted = false,
  ) {
    super(category);
    this.name = 'AuthenticatedMediaLoadError';
  }
}

function contentTypeOf(response: Response): string {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

async function requestMedia(url: string, signal: AbortSignal | undefined): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (import.meta.env.DEV) {
    headers['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
  }

  return fetch(url, { headers, credentials: 'include', signal });
}

/**
 * Loads protected video bytes with the same bearer/refresh behavior as API
 * requests, then hands the decoder a same-origin blob URL. This intentionally
 * trades one bounded in-memory media blob for reliable auth on cross-site
 * preview deployments; callers must revoke the returned object URL.
 */
export async function loadAuthenticatedMediaBlob(
  url: string,
  { signal }: LoadAuthenticatedMediaBlobOptions = {},
): Promise<AuthenticatedMediaBlob> {
  const mediaUrl = toMediaSrc(url);
  const source = sourceForUrl(mediaUrl);
  let retryAttempted = false;

  frameMediaDiagnostic('frame_media.load_started', { source, stage: 'request', retryAttempted });

  let response: Response;
  try {
    response = await requestMedia(mediaUrl, signal);
  } catch (error) {
    if (isAbort(error, signal)) {
      frameMediaDiagnostic('frame_media.load_aborted', {
        source,
        stage: 'request',
        retryAttempted,
      });
      throw new AuthenticatedMediaLoadError('aborted', null, retryAttempted);
    }
    frameMediaDiagnostic('frame_media.load_failed', { source, stage: 'request', retryAttempted });
    throw new AuthenticatedMediaLoadError('network', null, retryAttempted);
  }

  if (response.status === 401) {
    retryAttempted = true;
    frameMediaDiagnostic('frame_media.refresh_attempted', { source, status: 401, retryAttempted });
    const refreshed = await silentRefresh();
    throwIfAborted(signal, source, retryAttempted);
    if (!refreshed) {
      frameMediaDiagnostic('frame_media.load_failed', {
        source,
        status: 401,
        stage: 'response',
        retryAttempted,
      });
      throw new AuthenticatedMediaLoadError('authentication', 401, retryAttempted);
    }

    try {
      response = await requestMedia(mediaUrl, signal);
    } catch (error) {
      if (isAbort(error, signal)) {
        frameMediaDiagnostic('frame_media.load_aborted', {
          source,
          stage: 'request',
          retryAttempted,
        });
        throw new AuthenticatedMediaLoadError('aborted', null, retryAttempted);
      }
      frameMediaDiagnostic('frame_media.load_failed', { source, stage: 'request', retryAttempted });
      throw new AuthenticatedMediaLoadError('network', null, retryAttempted);
    }
  }

  if (!response.ok) {
    const category = categoryForStatus(response.status);
    frameMediaDiagnostic('frame_media.load_failed', {
      source,
      status: response.status,
      stage: 'response',
      retryAttempted,
    });
    throw new AuthenticatedMediaLoadError(category, response.status, retryAttempted);
  }

  const contentType = contentTypeOf(response);
  if (!ACCEPTED_VIDEO_TYPES.includes(contentType)) {
    frameMediaDiagnostic('frame_media.load_failed', {
      source,
      status: response.status,
      stage: 'blob',
      retryAttempted,
    });
    throw new AuthenticatedMediaLoadError('invalid-content-type', response.status, retryAttempted);
  }

  try {
    const blob = await response.blob();
    throwIfAborted(signal, source, retryAttempted);
    return { objectUrl: URL.createObjectURL(blob), contentType };
  } catch (error) {
    if (error instanceof AuthenticatedMediaLoadError) throw error;
    if (isAbort(error, signal)) {
      frameMediaDiagnostic('frame_media.load_aborted', { source, stage: 'blob', retryAttempted });
      throw new AuthenticatedMediaLoadError('aborted', null, retryAttempted);
    }
    frameMediaDiagnostic('frame_media.load_failed', { source, stage: 'blob', retryAttempted });
    throw new AuthenticatedMediaLoadError('network', response.status, retryAttempted);
  }
}
