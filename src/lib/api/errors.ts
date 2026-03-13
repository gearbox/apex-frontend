/**
 * Unified API error envelope — mirrors the backend's single error shape.
 *
 *   { error: string, message: string, status_code: number, detail?: object }
 *
 * Every non-2xx response from the backend uses this format.
 */
export interface ApiError {
  error: string;
  message: string;
  status_code: number;
  detail?: Record<string, unknown> | null;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    'message' in value &&
    'status_code' in value
  );
}

/**
 * Coerce any parsed response body into a typed ApiError.
 * Falls back to a generic envelope if the body doesn't match the expected shape.
 */
export function parseApiError(body: unknown, status: number): ApiError {
  if (isApiError(body)) return body;
  return {
    error: 'unknown_error',
    message: `Request failed (${status})`,
    status_code: status,
  };
}

/**
 * Thrown by auth flows (login, register, refresh, …).
 * Carries the full ApiError payload so callers can branch on `err.error` codes.
 */
export class AuthError extends Error {
  readonly error: string;
  readonly status_code: number;
  readonly detail?: Record<string, unknown> | null;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'AuthError';
    this.error = apiError.error;
    this.status_code = apiError.status_code;
    this.detail = apiError.detail;
  }

  /** Alias kept for backwards-compat with any `err.status` usages. */
  get status(): number {
    return this.status_code;
  }
}

/**
 * Thrown by non-auth API calls (admin, jobs, storage, …).
 * Lets callers inspect `err.error` for machine-readable codes and use
 * `err.message` (from the backend) directly in UI.
 */
export class ApiRequestError extends Error {
  readonly error: string;
  readonly status_code: number;
  readonly detail?: Record<string, unknown> | null;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiRequestError';
    this.error = apiError.error;
    this.status_code = apiError.status_code;
    this.detail = apiError.detail;
  }
}
