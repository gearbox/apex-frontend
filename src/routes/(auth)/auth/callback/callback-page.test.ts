import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../mocks/config';
import { invalidHandoffHandler } from '../../../../mocks/handlers/auth';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const { startOAuthSignIn } = vi.hoisted(() => ({ startOAuthSignIn: vi.fn() }));
vi.mock('$lib/api/oauth', () => ({ startOAuthSignIn }));

import { goto } from '$app/navigation';
import { clearAuth } from '$lib/stores/auth';
import { captureOAuthCallbackFragment, clearCapturedOAuthFragment } from '$lib/api/oauthFragment';
import * as pendingSignup from '$lib/api/oauthPendingSignup';
import * as oauthReturnTarget from '$lib/api/oauthReturnTarget';
import Page from './+page.svelte';

function capture(hash: string): void {
  captureOAuthCallbackFragment(
    { pathname: '/auth/callback', search: '', hash } as Location,
    { state: { __kit: { index: 1 } }, replaceState: vi.fn() } as unknown as History,
  );
}

function spyOnConsole(): ReturnType<typeof vi.spyOn>[] {
  return ['debug', 'error', 'info', 'log', 'warn'].map((method) =>
    vi.spyOn(console, method as keyof Console),
  );
}

function expectNoSecretInConsole(spies: ReturnType<typeof vi.spyOn>[], secret: string): void {
  for (const spy of spies) {
    for (const call of spy.mock.calls) expect(call.join(' ')).not.toContain(secret);
  }
}

beforeEach(() => {
  clearAuth();
  clearCapturedOAuthFragment();
  pendingSignup.clear();
  oauthReturnTarget.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  clearCapturedOAuthFragment();
  pendingSignup.clear();
  oauthReturnTarget.clear();
});

describe('OAuth callback page', () => {
  it('S1-a: login callback exit replaces history after redeeming the captured code', async () => {
    let credentials: RequestCredentials | undefined;
    server.use(
      http.post(`${BASE}/v1/auth/oauth/exchange`, async ({ request }) => {
        credentials = request.credentials;
        return HttpResponse.json({
          access_token: 'callback-access',
          refresh_token: 'callback-refresh',
          token_type: 'bearer',
          expires_in: 900,
          expires_at: new Date(Date.now() + 900_000).toISOString(),
          content_cookie_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        });
      }),
    );
    const consoleSpies = spyOnConsole();
    capture('#result=login&code=r1-login-code&return_to=%2Fapp%2Fgallery');

    render(Page);

    await waitFor(() => expect(goto).toHaveBeenCalledWith('/app/gallery', { replaceState: true }));
    expect(credentials).toBe('include');
    expectNoSecretInConsole(consoleSpies, 'r1-login-code');
    for (const spy of consoleSpies) spy.mockRestore();
  });

  it('T1-c: retries callback errors with the saved target, or null when the tab has none', async () => {
    oauthReturnTarget.save('/app/library');
    capture('#result=error&error=flow_expired');
    render(Page);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());
    await screen.getByRole('button', { name: 'Try again' }).click();
    expect(startOAuthSignIn).toHaveBeenCalledWith('google', '/app/library');

    cleanup();
    clearCapturedOAuthFragment();
    oauthReturnTarget.clear();
    vi.clearAllMocks();
    capture('#result=error&error=flow_expired');
    render(Page);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());
    await screen.getByRole('button', { name: 'Try again' }).click();
    expect(startOAuthSignIn).toHaveBeenCalledWith('google', null);
  });

  it('T1-d: clears the saved target after a successful login exit', async () => {
    oauthReturnTarget.save('/app/library');
    capture('#result=login&code=t1-success-code&return_to=%2Fapp%2Flibrary');

    render(Page);

    await waitFor(() => expect(goto).toHaveBeenCalledWith('/app/library', { replaceState: true }));
    expect(oauthReturnTarget.load()).toBeNull();
  });

  it('R1-a: keeps the working state when a duplicate mount sees an already submitted code', async () => {
    capture('#result=login&code=r1-duplicate-code');
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalled());
    cleanup();
    vi.clearAllMocks();

    capture('#result=login&code=r1-duplicate-code');
    render(Page);

    await waitFor(() => expect(screen.getByText('Signing you in…')).toBeTruthy());
    expect(goto).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('S1-a: signup callback exit replaces history without an exchange POST', async () => {
    let exchanges = 0;
    server.use(
      http.post(`${BASE}/v1/auth/oauth/exchange`, () => {
        exchanges += 1;
        return HttpResponse.json({});
      }),
    );
    capture('#result=signup&ticket=r1-signup-ticket&return_to=%2Fapp%2Flibrary');

    render(Page);

    await waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/signup', { replaceState: true }));
    expect(pendingSignup.load()).toMatchObject({
      ticket: 'r1-signup-ticket',
      returnTo: '/app/library',
    });
    expect(exchanges).toBe(0);
  });

  it('R1-c: shows invalid-handoff, account-inactive, and generic callback failures', async () => {
    const cases = [
      ['invalid_handoff', 400, /sign-in link has expired/i],
      ['account_inactive', 401, /account has been deactivated/i],
      ['unexpected_failure', 500, /couldn't complete sign-in/i],
    ] as const;

    for (const [error, status, message] of cases) {
      cleanup();
      clearCapturedOAuthFragment();
      vi.clearAllMocks();
      if (error === 'invalid_handoff') {
        server.use(invalidHandoffHandler);
      } else {
        server.use(
          http.post(`${BASE}/v1/auth/oauth/exchange`, () =>
            HttpResponse.json(
              { error, message: 'opaque server message', status_code: status },
              { status },
            ),
          ),
        );
      }
      capture(`#result=login&code=r1-${error}`);
      render(Page);
      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(message));
    }
  });

  it('S1-a: resumed signup callback exit replaces history and fails safely without a record', async () => {
    pendingSignup.save({ ticket: 'resume-ticket', returnTo: '/app/create', savedAt: Date.now() });
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/signup', { replaceState: true }));

    cleanup();
    pendingSignup.clear();
    vi.clearAllMocks();
    render(Page);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/couldn't complete sign-in/i),
    );
  });
});
