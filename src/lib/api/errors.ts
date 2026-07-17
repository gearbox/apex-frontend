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
  detail?: unknown;
  extra?: unknown;
  provider?: string;
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

  if (typeof body === 'object' && body !== null) {
    const value = body as Record<string, unknown>;
    const detail = value.detail;
    const message =
      typeof value.message === 'string'
        ? value.message
        : typeof detail === 'string'
          ? detail
          : `Request failed (${status})`;
    const code =
      typeof value.code === 'string'
        ? value.code
        : typeof value.error === 'string'
          ? value.error
          : 'http_error';

    // Litestar validation errors use { status_code, detail, extra }. Preserve
    // the detail and metadata verbatim so forms can display actionable errors.
    if ('detail' in value || 'status_code' in value || 'message' in value || 'error' in value) {
      return {
        error: code,
        message,
        status_code: typeof value.status_code === 'number' ? value.status_code : status,
        detail: detail ?? null,
        extra: value.extra,
        provider: typeof value.provider === 'string' ? value.provider : undefined,
      };
    }
  }

  // Compact compatibility body used by the top-up routes:
  // { code: "payment_provider_disabled", provider: "stripe" }
  if (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof (body as { code: unknown }).code === 'string'
  ) {
    const b = body as { code: string; provider?: string; detail?: unknown; message?: unknown };
    return {
      error: b.code,
      message:
        typeof b.message === 'string'
          ? b.message
          : typeof b.detail === 'string'
            ? b.detail
            : b.code === 'payment_provider_disabled'
              ? `Payment provider ${b.provider ?? ''} is currently disabled`.trim()
              : `Request failed (${status})`,
      status_code: status,
      detail: b.provider ? { provider: b.provider } : (b.detail ?? null),
      provider: b.provider,
    };
  }

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
  readonly detail?: unknown;

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
  readonly detail?: unknown;
  readonly extra?: unknown;
  readonly provider?: string;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiRequestError';
    this.error = apiError.error;
    this.status_code = apiError.status_code;
    this.detail = apiError.detail;
    this.extra = apiError.extra;
    this.provider = apiError.provider;
  }
}

/** Coerce an unknown openapi-fetch error into an ApiRequestError and throw it. */
export function throwApiError(error: unknown, fallbackMsg: string, status?: number): never {
  const apiErr = parseApiError(error, status ?? 0);
  throw new ApiRequestError({ ...apiErr, message: apiErr.message || fallbackMsg });
}
