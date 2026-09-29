import { API_BASE_URL } from '$lib/utils/constants';
import type { components } from '$lib/api/types';
import { safeReturnPath } from '$lib/utils/returnPath';
import * as oauthReturnTarget from './oauthReturnTarget';

export type OAuthProvider = 'google';
export type OAuthExchangeRequest = components['schemas']['OAuthExchangeRequest'];
export type OAuthSignupInfoRequest = components['schemas']['OAuthSignupInfoRequest'];
export type OAuthSignupInfo = components['schemas']['OAuthSignupInfoResponse'];
export type OAuthCompleteSignupRequest = components['schemas']['OAuthCompleteSignupRequest'];

export type OAuthErrorCode =
  | 'oauth_cancelled'
  | 'oauth_failed'
  | 'flow_expired'
  | 'email_unverified'
  | 'account_exists_unverified'
  | 'account_inactive'
  | 'identity_conflict'
  | 'invalid_handoff'
  | 'invalid_signup_ticket';

/** Full-page navigation is required so the API can set its HttpOnly transaction cookie. */
export function oauthAuthorizeUrl(provider: OAuthProvider, returnTo: string | null): string {
  const url = new URL(`/v1/auth/oauth/${provider}/authorize`, API_BASE_URL);
  const safeReturnTo = safeReturnPath(returnTo);
  if (safeReturnTo) url.searchParams.set('return_to', safeReturnTo);
  return url.toString();
}

export function startOAuthSignIn(provider: OAuthProvider, returnTo: string | null): void {
  oauthReturnTarget.save(returnTo);
  window.location.assign(oauthAuthorizeUrl(provider, returnTo));
}
