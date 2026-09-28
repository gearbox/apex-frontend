import type { OAuthErrorCode } from '$lib/api/oauth';
import { safeReturnPath } from '$lib/utils/returnPath';

export type OAuthFragment =
  | { result: 'login'; code: string; returnTo: string | null }
  | { result: 'signup'; ticket: string; returnTo: string | null }
  | { result: 'error'; error: OAuthErrorCode }
  | { result: 'invalid' };

export const OAUTH_CALLBACK_PATH = '/auth/callback';

// Only parsed data is retained so opaque callback values are never kept as a raw URL string.
let captured: OAuthFragment | null = null;

const ERROR_CODES = new Set<OAuthErrorCode>([
  'oauth_cancelled',
  'oauth_failed',
  'flow_expired',
  'email_unverified',
  'account_exists_unverified',
  'account_inactive',
  'identity_conflict',
  'invalid_handoff',
  'invalid_signup_ticket',
]);

/** Parse only the public callback grammar; opaque values must never be logged or rethrown. */
export function parseOAuthFragment(hash: string): OAuthFragment {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const result = params.get('result');
  const returnTo = safeReturnPath(params.get('return_to'));

  if (result === 'login') {
    const code = params.get('code');
    return code ? { result, code, returnTo } : { result: 'invalid' };
  }
  if (result === 'signup') {
    const ticket = params.get('ticket');
    return ticket ? { result, ticket, returnTo } : { result: 'invalid' };
  }
  if (result === 'error') {
    const error = params.get('error');
    return error && ERROR_CODES.has(error as OAuthErrorCode)
      ? { result, error: error as OAuthErrorCode }
      : { result: 'invalid' };
  }
  return { result: 'invalid' };
}

/**
 * Runs before SvelteKit begins routing. On the callback route, retain parsed data in memory and
 * remove the opaque fragment before layouts, requests, or third-party content can observe it.
 */
export function captureOAuthCallbackFragment(
  loc: Location = window.location,
  h: History = window.history,
): void {
  if (loc.pathname !== OAUTH_CALLBACK_PATH || !loc.hash) return;
  captured = parseOAuthFragment(loc.hash);
  // The router does not exist during client init, so this intentional native call preserves state.
  h.replaceState(h.state, '', loc.pathname + loc.search);
}

export function getCapturedOAuthFragment(): OAuthFragment | null {
  return captured;
}

export function clearCapturedOAuthFragment(): void {
  captured = null;
}
