import { silentRefresh } from '$lib/api/auth';
import { getAccessToken } from '$lib/stores/auth';
import {
  beginAuthOperation,
  finishAuthOperation,
  isAuthOperationCurrent,
} from '$lib/stores/authLifecycle';

/**
 * Session-aware request invariant: only an epoch change blocks a replay; within an epoch, always
 * send the newest token. A token rotation alone means a sibling request refreshed this session.
 */

export interface AuthRequestContext {
  /** The credential sent on the first attempt; only the shared 401 decision compares it. */
  initialToken: string | null;
  signal: AbortSignal;
  isCurrent(): boolean;
  getCurrentToken(): string | null;
  finish(): void;
}

export type AuthRequestRunner = (token: string | null, signal: AbortSignal) => Promise<Response>;
export type StaleAuthErrorFactory = () => Error;

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

/** Starts and owns the lifecycle for work bound to the currently authenticated session. */
export function beginAuthRequest(): AuthRequestContext {
  const operation = beginAuthOperation();

  return {
    initialToken: getAccessToken(),
    signal: operation.signal,
    isCurrent: () => isAuthOperationCurrent(operation),
    getCurrentToken: getAccessToken,
    finish: () => finishAuthOperation(operation),
  };
}

function assertCurrent(context: AuthRequestContext, staleError: StaleAuthErrorFactory): void {
  if (!context.isCurrent()) throw staleError();
}

/**
 * Keep terminal session handling identical for every request path. silentRefresh() records the
 * terminal reason before it clears credentials; this module owns the corresponding login redirect.
 */
function redirectAfterTerminalRefreshFailure(): void {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) return;

  const redirect = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?redirect=${redirect}`;
}

/**
 * Resolves a 401 once. The captured-token comparison is deliberately kept here so every caller
 * follows the same rotation rule: join a refresh only when no sibling has already rotated it.
 */
export async function retryUnauthorized(
  context: AuthRequestContext,
  response: Response,
  run: AuthRequestRunner,
  staleError: StaleAuthErrorFactory = abortError,
): Promise<Response> {
  if (response.status !== 401) return response;

  assertCurrent(context, staleError);

  if (getAccessToken() === context.initialToken) {
    const refreshed = await silentRefresh();

    if (!refreshed.ok) {
      // A superseded operation must never redirect the account that replaced it. A terminal
      // refresh has already persisted its reason in silentRefresh(), then cleared this session.
      if (
        refreshed.reason !== 'stale' &&
        refreshed.reason !== 'aborted' &&
        refreshed.reason !== 'network'
      ) {
        redirectAfterTerminalRefreshFailure();
      }
      return response;
    }

    assertCurrent(context, staleError);
  }

  const token = context.getCurrentToken();
  if (!token) return response;

  const retried = await run(token, context.signal);
  assertCurrent(context, staleError);
  return retried;
}

/**
 * Runs a request and response parser under one auth operation. The caller supplies the transport
 * so multipart uploads can rebuild FormData for every attempt while sharing the 401 policy.
 */
export async function withAuthOperation<T>(
  run: AuthRequestRunner,
  handle: (response: Response) => Promise<T>,
): Promise<T> {
  const context = beginAuthRequest();

  try {
    const initialResponse = await run(context.initialToken, context.signal);
    assertCurrent(context, abortError);

    const response = await retryUnauthorized(context, initialResponse, run);
    const result = await handle(response);
    assertCurrent(context, abortError);
    return result;
  } finally {
    context.finish();
  }
}
