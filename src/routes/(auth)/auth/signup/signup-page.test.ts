import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../mocks/config';
import {
  emailExistsSignupHandler,
  identityConflictSignupHandler,
  invalidSignupTicketHandler,
  legalStaleSignupHandler,
} from '../../../../mocks/handlers/auth';
import { resetLegalState } from '$lib/stores/legal';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { goto } from '$app/navigation';
import * as pendingSignup from '$lib/api/oauthPendingSignup';
import * as oauthReturnTarget from '$lib/api/oauthReturnTarget';
import Page from './+page.svelte';
import QueryHost, { hostProps } from '$lib/components/legal/testing/QueryHost.svelte';

const submitButton = () =>
  screen.getByRole('button', { name: /create account/i }) as HTMLButtonElement;

function seed(ticket = 'r1-signup-ticket', returnTo: string | null = '/app/library'): void {
  pendingSignup.save({ ticket, returnTo, savedAt: Date.now() });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(QueryHost, { props: hostProps(queryClient, Page, {}) });
}

async function acceptAllLegal(): Promise<void> {
  await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
  for (const checkbox of screen.getAllByRole('checkbox')) await fireEvent.click(checkbox);
  await waitFor(() => expect(submitButton().disabled).toBe(false));
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
  resetLegalState();
  pendingSignup.clear();
  oauthReturnTarget.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  resetLegalState();
  pendingSignup.clear();
  oauthReturnTarget.clear();
});

describe('OAuth signup page', () => {
  it('R1-e: loads signup info with credentials, renders its email, and requires valid legal consent', async () => {
    let credentials: RequestCredentials | undefined;
    server.use(
      http.post(`${BASE}/v1/auth/oauth/signup-info`, async ({ request }) => {
        credentials = request.credentials;
        return HttpResponse.json({ email: 'component-oauth@example.com', provider: 'google' });
      }),
    );
    const consoleSpies = spyOnConsole();
    seed('r1-email-ticket');

    renderPage();

    await waitFor(() => expect(screen.getByText(/component-oauth@example.com/)).toBeTruthy());
    expect(credentials).toBe('include');
    expect(submitButton().disabled).toBe(true);
    expectNoSecretInConsole(consoleSpies, 'r1-email-ticket');
    for (const spy of consoleSpies) spy.mockRestore();
  });

  it('R1-f: keeps a stale ticket and resubmits that same ticket after legal content refreshes', async () => {
    server.use(legalStaleSignupHandler);
    seed('r1-stale-ticket');
    renderPage();
    await acceptAllLegal();

    await fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getByText(/legal documents changed/i)).toBeTruthy());
    expect(pendingSignup.load()).toMatchObject({ ticket: 'r1-stale-ticket' });

    let secondTicket: string | undefined;
    server.use(
      http.post(`${BASE}/v1/auth/oauth/complete-signup`, async ({ request }) => {
        secondTicket = ((await request.json()) as { ticket: string }).ticket;
        return HttpResponse.json({
          access_token: 'signup-access',
          refresh_token: 'signup-refresh',
          token_type: 'bearer',
          expires_in: 900,
          expires_at: new Date(Date.now() + 900_000).toISOString(),
          content_cookie_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        });
      }),
    );
    await acceptAllLegal();
    await fireEvent.click(submitButton());

    await waitFor(() => expect(goto).toHaveBeenCalledWith('/app/library', { replaceState: true }));
    expect(secondTicket).toBe('r1-stale-ticket');
    expect(pendingSignup.load()).toBeNull();
  });

  it('T1-d: clears the saved target after successfully completing signup', async () => {
    seed('t1-clear-return-target');
    oauthReturnTarget.save('/app/library');
    renderPage();
    await acceptAllLegal();

    await fireEvent.click(submitButton());

    await waitFor(() => expect(goto).toHaveBeenCalledWith('/app/library', { replaceState: true }));
    expect(oauthReturnTarget.load()).toBeNull();
  });

  it.each([
    ['R1-g invalid ticket', invalidSignupTicketHandler, /sign-up session expired/i, false],
    [
      'R1-g email exists',
      emailExistsSignupHandler,
      /account with this email was just created/i,
      true,
    ],
    [
      'R1-g identity conflict',
      identityConflictSignupHandler,
      /already linked to a different/i,
      true,
    ],
  ])(
    '%s clears a terminal pending record and renders the matching panel',
    async (_, handler, copy, submit) => {
      server.use(handler);
      seed(`r1-terminal-${copy.source}`);
      renderPage();

      if (submit) {
        await waitFor(() => expect(screen.getByText(/google@example.com/)).toBeTruthy());
        await acceptAllLegal();
        await fireEvent.click(submitButton());
      }

      await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(copy));
      expect(pendingSignup.load()).toBeNull();
    },
  );

  it('R1-h: does not request signup info without a live pending record', async () => {
    let signupInfoCalls = 0;
    server.use(
      http.post(`${BASE}/v1/auth/oauth/signup-info`, () => {
        signupInfoCalls += 1;
        return HttpResponse.json({ email: 'should-not-render@example.com', provider: 'google' });
      }),
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/sign-up session expired/i),
    );
    expect(signupInfoCalls).toBe(0);
  });
});
