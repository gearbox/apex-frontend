import createClient, { type Middleware } from 'openapi-fetch';
import { API_BASE_URL } from '$lib/utils/constants';
import { getAccessToken } from '$lib/stores/auth';
import { silentRefresh } from '$lib/api/auth';
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

/** Pristine clones captured pre-dispatch so retries can re-send bodies. */
const retryTemplates = new WeakMap<Request, Request>();

/** Builds a fresh Request for a retry attempt from the pre-dispatch clone (body-safe). */
function buildRetryRequest(original: Request): Request {
  const template = retryTemplates.get(original);
  // Clone the template per attempt so multiple retries each get a fresh body.
  return template ? template.clone() : original.clone();
}

/* ─── Auth + Rate-limit Middleware ─── */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (import.meta.env.DEV) {
      request.headers.set('X-Product-Id', import.meta.env.VITE_PRODUCT_ID || 'vex');
    }
    const token = getAccessToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    // Cloning is safe here: all app bodies are JSON strings or FormData, never one-shot streams.
    retryTemplates.set(request, request.clone());
    return request;
  },

  async onResponse({ response, request }) {
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
        const currentHeaders = parseRateLimitHeaders(current.headers);
        // Retry-After beyond our cap: don't silently block the UI — hand the 429 back now.
        if (
          currentHeaders.retryAfter !== undefined &&
          currentHeaders.retryAfter * 1000 > MAX_RETRY_DELAY_MS
        ) {
          break;
        }
        const delay = getRetryDelay(currentHeaders.retryAfter, attempt);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        current = await fetch(buildRetryRequest(request));
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

    // Attempt refresh
    const refreshed = await silentRefresh();
    if (!refreshed) {
      // Redirect to login, preserving current path + query string. Skip if
      // already on /login — the (app) layout's own auth guard races this
      // handler on protected-route 401s, and re-deriving the redirect target
      // from window.location after that guard has already navigated produces
      // a self-referential nested redirect (e.g. /login?redirect=%2Flogin...).
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?redirect=${redirect}`;
      }
      return response;
    }

    // Retry original request with new token (body-safe clone; does not re-enter middleware)
    const retryReq = buildRetryRequest(request);
    const newToken = getAccessToken();
    if (newToken) {
      retryReq.headers.set('Authorization', `Bearer ${newToken}`);
    }
    return fetch(retryReq);
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
