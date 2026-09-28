import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

const { startOAuthSignIn } = vi.hoisted(() => ({ startOAuthSignIn: vi.fn() }));
vi.mock('$lib/api/oauth', () => ({ startOAuthSignIn }));

import OAuthErrorPanel from './OAuthErrorPanel.svelte';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('OAuthErrorPanel', () => {
  it.each([
    ['oauth_cancelled', /google sign-in was cancelled/i, 'Try again'],
    ['oauth_failed', /couldn't complete sign-in/i, 'Try again'],
    ['flow_expired', /sign-in session expired/i, 'Try again'],
    ['email_unverified', /email address isn't verified/i, 'Sign up with email'],
    ['account_exists_unverified', /email hasn't been verified/i, 'Sign in with password'],
    ['account_inactive', /account has been deactivated/i, 'Back to sign in'],
    ['identity_conflict', /already linked to a different/i, 'Try again'],
    ['invalid_handoff', /sign-in link has expired/i, 'Try again'],
    ['invalid_signup_ticket', /sign-up session expired/i, 'Try again'],
    ['email_exists', /account with this email was just created/i, 'Back to sign in'],
  ] as const)(
    'R1-j: renders %s with its prescribed copy and primary action',
    (code, copy, action) => {
      render(OAuthErrorPanel, { props: { code } });
      expect(screen.getByRole('alert').textContent).toMatch(copy);
      expect(
        screen.getByRole(action === 'Try again' ? 'button' : 'link', { name: action }),
      ).toBeTruthy();
    },
  );

  it('R5: restarts Google sign-in with the original return target', async () => {
    render(OAuthErrorPanel, { props: { code: 'oauth_failed', returnTo: '/app/gallery' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(startOAuthSignIn).toHaveBeenCalledWith('google', '/app/gallery');
  });
});
