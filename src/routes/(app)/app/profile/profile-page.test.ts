import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../mocks/config';
import { makeUserProfile } from '../../../../mocks/factories/user';

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
    setAuth(
      {
        accessToken: 'profile-access',
        refreshToken: 'profile-refresh',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      makeUserProfile({ email: 'oauth-only@example.com', has_password: false }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(QueryHost, { props: hostProps(queryClient, Page, {}) });

    expect(screen.getByRole('button', { name: 'Set a password' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Set a password' }));

    await waitFor(() => expect(requestEmail).toBe('oauth-only@example.com'));
    expect(screen.getByText(/emailed you a link to set a password/i)).toBeTruthy();
  });
});
