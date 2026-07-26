import createClient, { type Middleware } from 'openapi-fetch';
import { API_BASE_URL } from '$lib/utils/constants';
import { getAccessToken } from '$lib/stores/auth';
import { silentRefresh } from '$lib/api/auth';
import {
  beginAuthOperation,
  finishAuthOperation,
  isAuthOperationCurrent,
  type AuthOperation,
} from '$lib/stores/authLifecycle';
import {
  parseRateLimitHeaders,
  endpointKey,
  getRetryDelay,
  MAX_RETRY_DELAY_MS,
} from '$lib/api/rateLimit';
import { updateRateLimit } from '$lib/stores/rateLimit';
import { addToast } from '$lib/stores/toasts';
import { ROUTES } from '$lib/utils/routes';
import * as m from '$paraglide/messages';
import type { paths } from './types';

const MAX_RATE_LIMIT_RETRIES = 3;

const INSUFFICIENT_BALANCE_TOAST_THROTTLE_MS = 6000;
let lastInsufficientBalanceToastAt = 0;

/**
 * A retry always starts from the pre-Authorization clone. The metadata also proves that a delayed
 * request still belongs to the session which dispatched it; it must never be replayed with B's
 * bearer token after A has logged out or switched accounts.
 */
interface RetryMetadata {
  template: Request;
  accessToken: string | null;
  operation: AuthOperation;
}

const retryMetadata = new WeakMap<Request, RetryMetadata>();

/** Builds a fresh Request for a retry attempt from the pre-dispatch clone (body-safe). */
function buildRetryRequest(original: Request, metadata: RetryMetadata): Request {
  const template = metadata.template;
  // Clone the template per attempt so multiple retries each get a fresh body.
  return template ? template.clone() : original.clone();
}

function isOriginalCredentialCurrent(metadata: RetryMetadata): boolean {
  return isAuthOperationCurrent(metadata.operation) && getAccessToken() === metadata.accessToken;
}

function isRetrySessionCurrent(metadata: RetryMetadata): boolean {
  return isAuthOperationCurrent(metadata.operation);
}

/** Resolves false when logout/session replacement aborts the wait. */
function waitForRetryDelay(delay: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/* ─── Auth + Rate-limit Middleware ─── */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (import.meta.env.DEV) {
      request.headers.set('X-Product-Id', import.meta.env.VITE_PRODUCT_ID || 'vex');
    }
    // An explicit caller-provided header must never become the retry template's credential.
    request.headers.delete('Authorization');
    const token = getAccessToken();
    const operation = beginAuthOperation();
    // Capture after product headers but before Authorization. FormData/JSON bodies are cloned
    // here, while they are still pristine, so raw fetch retries remain body-safe.
    const metadata: RetryMetadata = { template: request.clone(), accessToken: token, operation };
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    retryMetadata.set(request, metadata);
    return request;
  },

  async onResponse({ response, request }) {
    const metadata = retryMetadata.get(request);
    // A request may be constructed outside this middleware in a test/adapter. It receives the
    // response normally, but no raw retry can be performed without an owned template.
    if (!metadata) return response;

    try {
      // Always parse and store rate limit headers
      const key = endpointKey(request.url);
      const rlHeaders = parseRateLimitHeaders(response.headers);
      if (Object.keys(rlHeaders).length > 0) {
        updateRateLimit(key, rlHeaders);
      }

      // 429 — smart retry loop with exponential backoff / Retry-After
      if (response.status === 429) {
        let current = response;
        for (let attempt = 1; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
          if (!isOriginalCredentialCurrent(metadata)) break;
          const currentHeaders = parseRateLimitHeaders(current.headers);
          // Retry-After beyond our cap: don't silently block the UI — hand the 429 back now.
          if (
            currentHeaders.retryAfter !== undefined &&
            currentHeaders.retryAfter * 1000 > MAX_RETRY_DELAY_MS
          ) {
            break;
          }
          const delay = getRetryDelay(currentHeaders.retryAfter, attempt);
          if (!(await waitForRetryDelay(delay, metadata.operation.signal))) break;
          if (!isOriginalCredentialCurrent(metadata)) break;
          current = await fetch(buildRetryRequest(request, metadata));
          const retriedHeaders = parseRateLimitHeaders(current.headers);
          if (Object.keys(retriedHeaders).length > 0) {
            updateRateLimit(key, retriedHeaders);
          }
          if (current.status !== 429) break;
        }
        return current;
      }

      if (response.status === 402) {
        const nowTs = Date.now();
        if (nowTs - lastInsufficientBalanceToastAt > INSUFFICIENT_BALANCE_TOAST_THROTTLE_MS) {
          lastInsufficientBalanceToastAt = nowTs;
          addToast({
            type: 'warning',
            message: m.error_insufficient_balance(),
            durationMs: 6000,
            action: { label: 'Top up →', href: ROUTES.billingTopUp },
          });
        }
        return response;
      }

      if (response.status !== 401) return response;

      // The request's original credential must still be active before it can trigger a refresh.
      if (!isOriginalCredentialCurrent(metadata)) return response;

      // Attempt refresh
      const result = await silentRefresh();
      if (!result.ok) {
        // Redirect to login, preserving current path + query string. Skip if
        // already on /login — the (app) layout's own auth guard races this
        // handler on protected-route 401s, and re-deriving the redirect target
        // from window.location after that guard has already navigated produces
        // a self-referential nested redirect (e.g. /login?redirect=%2Flogin...).
        // silentRefresh() has already persisted `result.reason` (see auth.ts,
        // setAuthFailureReason) so the login screen can pick the right message (B2).
        if (
          result.reason === 'stale' ||
          result.reason === 'aborted' ||
          result.reason === 'network'
        ) {
          return response;
        }
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?redirect=${redirect}`;
        }
        return response;
      }

      // Retry original request with new token (body-safe clone; does not re-enter middleware)
      if (!isRetrySessionCurrent(metadata)) return response;
      const retryReq = buildRetryRequest(request, metadata);
      const newToken = getAccessToken();
      // A successful same-epoch refresh is the only permitted way for this request to use a newer
      // bearer. Missing credentials mean the response is handed back without a replay.
      if (!newToken) return response;
      retryReq.headers.set('Authorization', `Bearer ${newToken}`);
      return fetch(retryReq);
    } finally {
      finishAuthOperation(metadata.operation);
    }
  },
};

/* ─── Client Instance ─── */
// Use a lazy fetch wrapper so tests can intercept via MSW after module initialization
const apiClient = createClient<paths>({
  baseUrl: API_BASE_URL,
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
});
apiClient.use(authMiddleware);

export default apiClient;
