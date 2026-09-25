import { ACCEPTED_VIDEO_TYPES } from '$lib/utils/constants';
import { recoverContentAccess } from './contentAccessRecovery';
import {
  fetchProtectedContent,
  parseProtectedContentUrl,
  type ProtectedContentUrl,
} from './protectedContent';

export type FrameMediaSource = 'output' | 'upload' | 'unknown';
export type FrameMediaFailureCategory =
  | 'authentication'
  | 'forbidden'
  | 'not-found'
  | 'server'
  | 'request'
  | 'invalid-url'
  | 'invalid-content-type'
  | 'too-large'
  | 'network'
  | 'aborted';

interface FrameMediaDiagnostic {
  source: FrameMediaSource;
  category?: FrameMediaFailureCategory;
  status?: number;
  stage?: 'request' | 'refresh' | 'response' | 'blob';
  retryAttempted?: boolean;
}

export interface AuthenticatedMediaBlob {
  objectUrl: string;
  contentType: string;
}

/**
 * Live authenticated decoding retains the downloaded video alongside browser
 * decoder buffers. Keep that combined allocation conservative for mobile
 * browsers until the API offers a scoped, range-capable media ticket.
 */
export const MAX_LIVE_FRAME_MEDIA_BYTES = 25 * 1024 * 1024;

export interface LoadAuthenticatedMediaBlobOptions {
  signal?: AbortSignal;
  /** The API's media metadata size, checked before the protected request. */
  expectedSizeBytes?: number;
  /** Testable override; production callers use MAX_LIVE_FRAME_MEDIA_BYTES. */
  maxSizeBytes?: number;
}

export type ValidatedProtectedMediaUrl = ProtectedContentUrl;

interface LoadContext {
  target: ProtectedContentUrl;
  source: FrameMediaSource;
  signal?: AbortSignal;
  expectedSizeBytes?: number;
  maxSizeBytes: number;
  retryAttempted: boolean;
}

/**
 * Deliberately contains only safe diagnostic fields. In particular, do not add
 * a URL or credential value here: both can be sensitive in other callers.
 */
function frameMediaDiagnostic(event: string, details: FrameMediaDiagnostic): void {
  console.debug(event, details);
}

/**
 * Resolves only the two API content routes that may receive content-cookie
 * credentials. This must run before any request is issued.
 */
export function validateProtectedMediaUrl(value: string): ValidatedProtectedMediaUrl {
  const target = parseProtectedContentUrl(value);
  if (!target) throw new AuthenticatedMediaLoadError('invalid-url');
  return target;
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

function diagnostic(
  context: LoadContext,
  stage: FrameMediaDiagnostic['stage'],
): FrameMediaDiagnostic {
  return {
    source: context.source,
    stage,
    retryAttempted: context.retryAttempted,
  };
}

function throwLoadError(
  context: LoadContext,
  category: FrameMediaFailureCategory,
  status: number | null,
  stage: FrameMediaDiagnostic['stage'],
): never {
  frameMediaDiagnostic('frame_media.load_failed', {
    ...diagnostic(context, stage),
    category,
    ...(status === null ? {} : { status }),
  });
  throw new AuthenticatedMediaLoadError(category, status, context.retryAttempted);
}

function throwAborted(context: LoadContext, stage: FrameMediaDiagnostic['stage']): never {
  frameMediaDiagnostic('frame_media.load_aborted', diagnostic(context, stage));
  throw new AuthenticatedMediaLoadError('aborted', null, context.retryAttempted);
}

function ensureNotAborted(context: LoadContext, stage: FrameMediaDiagnostic['stage']): void {
  if (context.signal?.aborted) throwAborted(context, stage);
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

function createLoadContext(
  validated: ValidatedProtectedMediaUrl,
  options: LoadAuthenticatedMediaBlobOptions,
): LoadContext {
  const maxSizeBytes = options.maxSizeBytes ?? MAX_LIVE_FRAME_MEDIA_BYTES;
  if (!Number.isSafeInteger(maxSizeBytes) || maxSizeBytes < 1) {
    throw new AuthenticatedMediaLoadError('too-large');
  }

  return {
    target: validated,
    source: validated.source,
    signal: options.signal,
    expectedSizeBytes: options.expectedSizeBytes,
    maxSizeBytes,
    retryAttempted: false,
  };
}

function validateExpectedSize(context: LoadContext): void {
  const size = context.expectedSizeBytes;
  if (size === undefined) return;
  if (!Number.isSafeInteger(size) || size < 0 || size > context.maxSizeBytes) {
    throwLoadError(context, 'too-large', null, 'response');
  }
}

function contentLengthOf(response: Response): number | null {
  const value = response.headers.get('content-length');
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return Number.NaN;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : Number.NaN;
}

function validateResponseSize(context: LoadContext, response: Response): void {
  const contentLength = contentLengthOf(response);
  if (contentLength === null) return;

  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength > context.maxSizeBytes ||
    (context.expectedSizeBytes !== undefined && contentLength !== context.expectedSizeBytes)
  ) {
    throwLoadError(context, 'too-large', response.status, 'response');
  }
}

async function fetchWithDiagnostics(context: LoadContext): Promise<Response> {
  ensureNotAborted(context, 'request');
  try {
    const response = await fetchProtectedContent(context.target, { signal: context.signal });
    ensureNotAborted(context, 'request');
    return response;
  } catch (error) {
    if (error instanceof AuthenticatedMediaLoadError) throw error;
    if (isAbort(error, context.signal)) throwAborted(context, 'request');
    throwLoadError(context, 'network', null, 'request');
  }
}

/** One-shot content-access recovery; the caller retries the same URL once on success. */
async function recoverAfterUnauthorized(context: LoadContext): Promise<void> {
  context.retryAttempted = true;
  frameMediaDiagnostic('frame_media.refresh_attempted', {
    ...diagnostic(context, 'refresh'),
    status: 401,
  });
  ensureNotAborted(context, 'refresh');

  const recovery = await recoverContentAccess({ signal: context.signal });

  ensureNotAborted(context, 'refresh');
  if (recovery.ok) return;
  if (recovery.reason === 'aborted') throwAborted(context, 'refresh');
  if (recovery.reason === 'transient' || recovery.reason === 'rate_limited') {
    throwLoadError(context, 'network', null, 'refresh');
  }
  throwLoadError(context, 'authentication', 401, 'refresh');
}

function validateVideoContentType(context: LoadContext, response: Response): string {
  const contentType = contentTypeOf(response);
  if (!ACCEPTED_VIDEO_TYPES.includes(contentType)) {
    throwLoadError(context, 'invalid-content-type', response.status, 'response');
  }
  return contentType;
}

async function readBoundedBlob(
  context: LoadContext,
  response: Response,
  contentType: string,
): Promise<Blob> {
  const reader = response.body?.getReader();
  if (!reader) throwLoadError(context, 'network', response.status, 'blob');

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancelOnAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  context.signal?.addEventListener('abort', cancelOnAbort, { once: true });

  try {
    while (true) {
      ensureNotAborted(context, 'blob');
      const { done, value } = await reader.read();
      ensureNotAborted(context, 'blob');
      if (done) break;
      if (!value) continue;

      byteLength += value.byteLength;
      if (byteLength > context.maxSizeBytes) {
        try {
          await reader.cancel();
        } catch {
          // The typed size failure below remains the only public outcome.
        }
        throwLoadError(context, 'too-large', response.status, 'blob');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AuthenticatedMediaLoadError) throw error;
    if (isAbort(error, context.signal)) throwAborted(context, 'blob');
    throwLoadError(context, 'network', response.status, 'blob');
  } finally {
    context.signal?.removeEventListener('abort', cancelOnAbort);
  }

  const blobParts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  return new Blob(blobParts, { type: contentType });
}

/**
 * Loads protected video bytes with content-cookie credentials (never a bearer
 * header) and one-shot content-access recovery on 401, then hands the decoder
 * a same-origin blob URL. The explicit size
 * cap bounds the client-side buffering required for authenticated decoding;
 * callers must revoke the returned object URL.
 */
export async function loadAuthenticatedMediaBlob(
  value: string,
  options: LoadAuthenticatedMediaBlobOptions = {},
): Promise<AuthenticatedMediaBlob> {
  let validated: ValidatedProtectedMediaUrl;
  try {
    validated = validateProtectedMediaUrl(value);
  } catch (error) {
    if (error instanceof AuthenticatedMediaLoadError) {
      frameMediaDiagnostic('frame_media.load_failed', {
        source: 'unknown',
        category: error.category,
        stage: 'request',
        retryAttempted: false,
      });
      throw error;
    }
    throw new AuthenticatedMediaLoadError('invalid-url');
  }

  const context = createLoadContext(validated, options);
  frameMediaDiagnostic('frame_media.load_started', diagnostic(context, 'request'));
  validateExpectedSize(context);

  let response = await fetchWithDiagnostics(context);
  if (response.status === 401) {
    await recoverAfterUnauthorized(context);
    response = await fetchWithDiagnostics(context);
  }

  if (!response.ok)
    throwLoadError(context, categoryForStatus(response.status), response.status, 'response');

  const contentType = validateVideoContentType(context, response);
  validateResponseSize(context, response);
  const blob = await readBoundedBlob(context, response, contentType);
  ensureNotAborted(context, 'blob');

  return { objectUrl: URL.createObjectURL(blob), contentType };
}
