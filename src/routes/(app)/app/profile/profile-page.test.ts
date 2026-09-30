import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../mocks/config';
import { makeUserProfile } from '../../../../mocks/factories/user';
import type { UserProfile } from '$lib/stores/auth';

vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { clearAuth, setAuth } from '$lib/stores/auth';
import Page from './+page.svelte';
import QueryHost, { hostProps } from '$lib/components/legal/testing/QueryHost.svelte';

function authenticate(overrides: Partial<UserProfile> = {}) {
  setAuth(
    {
      accessToken: 'profile-access',
      refreshToken: 'profile-refresh',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    makeUserProfile(overrides),
  );
}

function renderProfile() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(QueryHost, { props: hostProps(queryClient, Page, {}) });
}

beforeEach(() => {
  clearAuth();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  clearAuth();
});

describe('profile page', () => {
  it('R1-l: offers OAuth-only users a reset-email password setup action instead of change password', async () => {
    let requestEmail: string | undefined;
    server.use(
      http.post(`${BASE}/v1/auth/forgot-password`, async ({ request }) => {
        requestEmail = ((await request.json()) as { email: string }).email;
        return HttpResponse.json({ message: 'Password reset email sent' });
      }),
    );
    authenticate({ email: 'oauth-only@example.com', has_password: false });
    renderProfile();

    expect(screen.getByRole('button', { name: 'Set a password' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Set a password' }));

    await waitFor(() => expect(requestEmail).toBe('oauth-only@example.com'));
    expect(screen.getByText(/emailed you a link to set a password/i)).toBeTruthy();
  });

  it('shows the verified badge without a resend action for a verified account', () => {
    authenticate({ email_verified: true });
    renderProfile();

    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull();
  });

  it('shows the resend action for an unverified account', () => {
    authenticate({ email_verified: false });
    renderProfile();

    expect(screen.getByText('Not verified')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeTruthy();
  });

  it('keeps the resend success notice when profile reconciliation fails', async () => {
    server.use(
      http.post(`${BASE}/v1/auth/resend-verification`, () =>
        HttpResponse.json({ message: 'Verification email sent' }),
      ),
      http.get(`${BASE}/v1/users/me`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Profile temporarily unavailable', status_code: 503 },
          { status: 503 },
        ),
      ),
    );
    authenticate({ email: 'waiting@example.com', email_verified: false });
    renderProfile();

    await fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect((await screen.findByRole('status')).textContent).toContain(
      'Verification email sent to waiting@example.com',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks the current user verified when resend reports an already-verified account', async () => {
    server.use(
      http.post(`${BASE}/v1/auth/resend-verification`, () =>
        HttpResponse.json({ message: 'Email is already verified' }),
      ),
    );
    authenticate({ email_verified: false });
    renderProfile();

    await fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(await screen.findByText('Verified')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull();
  });

  it('clears a stale resend rate-limit error after focus refresh confirms verification', async () => {
    server.use(
      http.post(`${BASE}/v1/auth/resend-verification`, () =>
        HttpResponse.json(
          { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
          { status: 429, headers: { 'Retry-After': '0' } },
        ),
      ),
    );
    authenticate({ email_verified: false });
    renderProfile();

    await fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Too many requests. Please wait a moment.',
    );

    server.use(
      http.get(`${BASE}/v1/users/me`, () =>
        HttpResponse.json({
          ...makeUserProfile({ email_verified: true }),
          locale: 'en',
          is_active: true,
        }),
      ),
    );
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByText('Verified')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows localized rate-limit copy when Set a password is throttled', async () => {
    server.use(
      http.post(`${BASE}/v1/auth/forgot-password`, () =>
        HttpResponse.json(
          { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
          { status: 429 },
        ),
      ),
    );
    authenticate({ has_password: false });
    renderProfile();

    await fireEvent.click(screen.getByRole('button', { name: 'Set a password' }));

    expect(await screen.findByText('Too many requests. Please wait a moment.')).toBeTruthy();
  });
});
