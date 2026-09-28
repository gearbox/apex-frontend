import type { OAuthErrorCode } from '$lib/api/oauth';
import { safeReturnPath } from '$lib/utils/returnPath';

export type OAuthFragment =
  | { result: 'login'; code: string; returnTo: string | null }
  | { result: 'signup'; ticket: string; returnTo: string | null }
  | { result: 'error'; error: OAuthErrorCode }
  | { result: 'invalid' };

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
