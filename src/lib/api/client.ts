import createClient, { type Middleware } from 'openapi-fetch';
import { API_BASE_URL } from '$lib/utils/constants';
import { beginAuthRequest, retryUnauthorized, type AuthRequestContext } from '$lib/api/authedFetch';
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
  auth: AuthRequestContext;
  /**
   * The auth-operation signal combined with the caller/TanStack signal for the whole logical
   * request. A retry (429 backoff wait or post-401 replay) must keep listening to the caller
   * after the first HTTP response, not just to the auth epoch.
   */
  signal: AbortSignal;
}

const retryMetadata = new WeakMap<Request, RetryMetadata>();

/** A response that belongs to an invalidated session must never reach its caller. */
export class StaleSessionError extends Error {
  constructor() {
    super('The request outlived its authenticated session');
    this.name = 'StaleSessionError';
  }
}

/**
 * Builds a fresh, abort-bound Request for a retry attempt from the pre-dispatch clone.
 *
 * Retry templates intentionally contain no bearer. A retry may only use a credential from the
 * original auth epoch; within that epoch, the newest token is always the correct one to send.
 */
function buildRetryRequest(original: Request, metadata: RetryMetadata): Request {
  const template = metadata.template;
  // Clone the template per attempt so multiple retries each get a fresh body.
  const retry = template ? template.clone() : original.clone();
  return new Request(retry, { signal: metadata.signal });
}

function isRetrySessionCurrent(metadata: RetryMetadata): boolean {
  return metadata.auth.isCurrent();
}

/** A canceled caller must never keep a retry alive, additive to the auth-epoch check above. */
function isRetryLive(metadata: RetryMetadata): boolean {
  return !metadata.signal.aborted && isRetrySessionCurrent(metadata);
}

/** Preserve the reason a logical request is no longer allowed to settle. */
function assertRetryLive(metadata: RetryMetadata): void {
  if (!isRetrySessionCurrent(metadata)) throw new StaleSessionError();
  if (metadata.signal.aborted) throw new DOMException('Aborted', 'AbortError');
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
    const auth = beginAuthRequest();
    // Request signals are immutable, so bind both the auth-operation and caller (TanStack query)
    // signals on a reconstructed request. Reconciliation cancellation must reach openapi-fetch.
    // This combined signal governs the whole logical request, including every retry attempt —
    // not just the initial dispatch — so a canceled caller stops 429 backoff waits and post-401
    // replays too, not only the first fetch.
    const signal = AbortSignal.any([request.signal, auth.signal]);
    // Capture after product headers but before Authorization. FormData/JSON bodies are cloned
    // here, while they are still pristine, so raw fetch retries remain body-safe.
    const metadata: RetryMetadata = { template: request.clone(), auth, signal };
    if (auth.initialToken) {
      request.headers.set('Authorization', `Bearer ${auth.initialToken}`);
    }
    // The metadata must follow the returned instance because it is what onResponse/onError receive.
    const bound = new Request(request, { signal });
    retryMetadata.set(bound, metadata);
    return bound;
  },

  async onResponse({ response, request }) {
    const metadata = retryMetadata.get(request);
    // A request may be constructed outside this middleware in a test/adapter. It receives the
    // response normally, but no raw retry can be performed without an owned template.
    if (!metadata) return response;

    try {
      // Aborting fetch is not sufficient when a response was already in flight. Never hand a
      // response from an invalidated session to a caller that may write it into current state.
      assertRetryLive(metadata);

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
          assertRetryLive(metadata);
          const currentHeaders = parseRateLimitHeaders(current.headers);
          // Retry-After beyond our cap: don't silently block the UI — hand the 429 back now.
          if (
            currentHeaders.retryAfter !== undefined &&
            currentHeaders.retryAfter * 1000 > MAX_RETRY_DELAY_MS
          ) {
            break;
          }
          const delay = getRetryDelay(currentHeaders.retryAfter, attempt);
          if (!(await waitForRetryDelay(delay, metadata.signal))) assertRetryLive(metadata);
          assertRetryLive(metadata);
          const retryReq = buildRetryRequest(request, metadata);
          // A retry may only ever use a credential from the original auth epoch; within that
          // epoch the newest token is always the correct one to send.
          const token = metadata.auth.getCurrentToken();
          if (token) {
            retryReq.headers.set('Authorization', `Bearer ${token}`);
          }
          current = await fetch(retryReq);
          assertRetryLive(metadata);
          const retriedHeaders = parseRateLimitHeaders(current.headers);
          if (Object.keys(retriedHeaders).length > 0) {
            updateRateLimit(key, retriedHeaders);
          }
          if (current.status !== 429) break;
        }
        assertRetryLive(metadata);
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

      const replayed = await retryUnauthorized(
        metadata.auth,
        response,
        (token) => {
          // A sibling refresh may complete after this caller was canceled. Honor that before
          // replaying — a canceled caller must not receive its own request re-sent on a new token.
          if (!isRetryLive(metadata))
            return Promise.reject(new DOMException('Aborted', 'AbortError'));
          const retryReq = buildRetryRequest(request, metadata);
          retryReq.headers.set('Authorization', `Bearer ${token}`);
          return fetch(retryReq);
        },
        () => new StaleSessionError(),
      );
      assertRetryLive(metadata);
      return replayed;
    } finally {
      metadata.auth.finish();
    }
  },

  onError({ request }) {
    const metadata = retryMetadata.get(request);
    if (!metadata) return;
    // onResponse is skipped for fetch rejections, including offline and abort failures.
    metadata.auth.finish();
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
