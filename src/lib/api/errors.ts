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
  pay_currency?: string;
  retry_after_seconds?: number;
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const error = value as Record<string, unknown>;
  return (
    typeof error.error === 'string' &&
    typeof error.message === 'string' &&
    typeof error.status_code === 'number'
  );
}

function isKnownStatus(status: number): boolean {
  return Number.isFinite(status) && status > 0;
}

function fallbackMessage(status: number): string {
  return `Request failed (${status})`;
}

/** Normalize every object-shaped backend error body in one place. */
export function parseObjectApiError(value: Record<string, unknown>, status: number): ApiError {
  if (
    !('code' in value) &&
    !('error' in value) &&
    !('message' in value) &&
    !('detail' in value) &&
    !('status_code' in value) &&
    !('extra' in value) &&
    !('provider' in value) &&
    !('pay_currency' in value)
  ) {
    return { error: 'unknown_error', message: fallbackMessage(status), status_code: status };
  }
  const provider = typeof value.provider === 'string' ? value.provider : undefined;
  const payCurrency = typeof value.pay_currency === 'string' ? value.pay_currency : undefined;
  const code =
    typeof value.code === 'string'
      ? value.code
      : typeof value.error === 'string'
        ? value.error
        : 'http_error';
  const bodyStatus = typeof value.status_code === 'number' ? value.status_code : 0;
  const resolvedStatus = isKnownStatus(status) ? status : bodyStatus;
  const detail = value.detail;
  const message =
    typeof value.message === 'string' && value.message.trim()
      ? value.message
      : typeof detail === 'string' && detail.trim()
        ? detail
        : code === 'payment_provider_disabled' && provider
          ? `Payment provider ${provider} is currently disabled`
          : fallbackMessage(resolvedStatus);

  return {
    error: code,
    message,
    status_code: resolvedStatus,
    detail: detail ?? (provider ? { provider } : null),
    ...(value.extra !== undefined ? { extra: value.extra } : {}),
    ...(provider ? { provider } : {}),
    ...(payCurrency ? { pay_currency: payCurrency } : {}),
  };
}

/**
 * Coerce any parsed response body into a typed ApiError.
 * Falls back to a generic envelope if the body doesn't match the expected shape.
 */
export function parseApiError(body: unknown, status: number): ApiError {
  if (typeof body === 'object' && body !== null) {
    return parseObjectApiError(body as Record<string, unknown>, status);
  }

  return {
    error: 'unknown_error',
    message: fallbackMessage(status),
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
  readonly pay_currency?: string;
  readonly retry_after_seconds?: number;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiRequestError';
    this.error = apiError.error;
    this.status_code = apiError.status_code;
    this.detail = apiError.detail;
    this.extra = apiError.extra;
    this.provider = apiError.provider;
    this.pay_currency = apiError.pay_currency;
    this.retry_after_seconds = apiError.retry_after_seconds;
  }
}

/** Coerce an unknown openapi-fetch error into an ApiRequestError and throw it. */
function retryAfterSeconds(headers?: Headers): number | undefined {
  const raw = headers?.get('Retry-After');
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const seconds = Number(raw);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

export function throwApiError(
  error: unknown,
  fallbackMsg: string,
  status?: number,
  headers?: Headers,
): never {
  const apiErr = parseApiError(error, status ?? 0);
  throw new ApiRequestError({
    ...apiErr,
    ...(retryAfterSeconds(headers) !== undefined
      ? { retry_after_seconds: retryAfterSeconds(headers) }
      : {}),
    message:
      apiErr.error === 'unknown_error' && !isKnownStatus(apiErr.status_code)
        ? fallbackMsg
        : apiErr.message || fallbackMsg,
  });
}
