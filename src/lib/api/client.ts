import createClient, { type Middleware } from 'openapi-fetch';
import { API_BASE_URL } from '$lib/utils/constants';
import { getAccessToken } from '$lib/stores/auth';
import { silentRefresh } from '$lib/api/auth';
import { parseRateLimitHeaders, endpointKey, getRetryDelay } from '$lib/api/rateLimit';
import { updateRateLimit } from '$lib/stores/rateLimit';
import { addToast } from '$lib/stores/toasts';
import { ROUTES } from '$lib/utils/routes';
import * as m from '$paraglide/messages';
import type { paths } from './types';

const MAX_RATE_LIMIT_RETRIES = 3;

const INSUFFICIENT_BALANCE_TOAST_THROTTLE_MS = 6000;
let lastInsufficientBalanceToastAt = 0;

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
        const delay = getRetryDelay(currentHeaders.retryAfter, attempt);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        current = await fetch(request);
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
      // Redirect to login, preserving current path
      if (typeof window !== 'undefined') {
        const redirect = encodeURIComponent(window.location.pathname);
        window.location.href = `/login?redirect=${redirect}`;
      }
      return response;
    }

    // Retry original request with new token
    const newToken = getAccessToken();
    if (newToken) {
      request.headers.set('Authorization', `Bearer ${newToken}`);
    }
    return fetch(request);
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
