import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../mocks/config';
import { invalidHandoffHandler } from '../../../../mocks/handlers/auth';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { goto } from '$app/navigation';
import { clearAuth } from '$lib/stores/auth';
import { captureOAuthCallbackFragment, clearCapturedOAuthFragment } from '$lib/api/oauthFragment';
import * as pendingSignup from '$lib/api/oauthPendingSignup';
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
  sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  clearCapturedOAuthFragment();
  pendingSignup.clear();
});

describe('OAuth callback page', () => {
  it('R1-a: redeems a captured login once with credentials and navigates to its safe return path', async () => {
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

    await waitFor(() => expect(goto).toHaveBeenCalledWith('/app/gallery'));
    expect(credentials).toBe('include');
    expectNoSecretInConsole(consoleSpies, 'r1-login-code');
    for (const spy of consoleSpies) spy.mockRestore();
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

  it('R1-b: saves a captured signup ticket and dispatches without an exchange POST', async () => {
    let exchanges = 0;
    server.use(
      http.post(`${BASE}/v1/auth/oauth/exchange`, () => {
        exchanges += 1;
        return HttpResponse.json({});
      }),
    );
    capture('#result=signup&ticket=r1-signup-ticket&return_to=%2Fapp%2Flibrary');

    render(Page);

    await waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/signup'));
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

  it('R1-d: resumes a stored signup handoff without a fragment and fails safely without one', async () => {
    pendingSignup.save({ ticket: 'resume-ticket', returnTo: '/app/create', savedAt: Date.now() });
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/signup'));

    cleanup();
    pendingSignup.clear();
    vi.clearAllMocks();
    render(Page);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/couldn't complete sign-in/i),
    );
  });
});
