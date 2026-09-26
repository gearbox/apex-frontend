import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import type { LegalDocType, LegalStatus } from '$lib/api/legal';
import { legalKeys } from '$lib/queries/legal';
import {
  hasLegalDocuments,
  legalReacceptanceRequired,
  markLegalReacceptanceRequired,
  resetLegalState,
} from '$lib/stores/legal';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const silentRefresh = vi.fn();
vi.mock('$lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/auth')>()),
  silentRefresh: () => silentRefresh(),
  logout: vi.fn(),
}));

import LegalReacceptanceModal from './LegalReacceptanceModal.svelte';
import QueryHost, { hostProps } from './testing/QueryHost.svelte';

const V1 = '2026-10-01';
const V2 = '2026-11-01';
const TYPES: LegalDocType[] = ['terms', 'privacy', 'sensitive_data_consent'];
const SHA: Record<LegalDocType, string> = {
  terms: 'a'.repeat(64),
  privacy: 'b'.repeat(64),
  sensitive_data_consent: 'c'.repeat(64),
};

interface DocState {
  current: string;
  required: string;
  accepted: string | null;
}

function statusFor(states: Record<LegalDocType, DocState>): LegalStatus {
  const documents = TYPES.map((doc_type) => {
    const { current, required, accepted } = states[doc_type];
    return {
      doc_type,
      required_version: required,
      current_version: current,
      accepted_version: accepted,
      accepted_at: accepted ? `${accepted}T00:00:00Z` : null,
      satisfied: accepted !== null && accepted >= required,
    };
  });
  return { documents, all_satisfied: documents.every((document) => document.satisfied) };
}

const ALL_CURRENT: Record<LegalDocType, DocState> = {
  terms: { current: V1, required: V1, accepted: V1 },
  privacy: { current: V1, required: V1, accepted: V1 },
  sensitive_data_consent: { current: V1, required: V1, accepted: V1 },
};
const PRIVACY_UNSATISFIED: Record<LegalDocType, DocState> = {
  ...ALL_CURRENT,
  privacy: { current: V2, required: V2, accepted: V1 },
};

let acceptBodies: unknown[] = [];

/** `/current` and exact bodies follow the `current` version of each document in `states`. */
function useServerState(states: Record<LegalDocType, DocState>, status = statusFor(states)) {
  server.use(
    http.get(`${BASE}/v1/legal/current`, () =>
      HttpResponse.json({
        documents: TYPES.map((doc_type) => ({
          doc_type,
          version: states[doc_type].current,
          sha256: SHA[doc_type],
          requires_reacceptance: true,
        })),
      }),
    ),
    http.get(`${BASE}/v1/legal/documents/:docType`, ({ params, request }) => {
      const doc_type = params.docType as LegalDocType;
      const version = new URL(request.url).searchParams.get('version') ?? states[doc_type].current;
      return HttpResponse.json({
        doc_type,
        version,
        sha256: SHA[doc_type],
        requires_reacceptance: true,
        content_md: `# ${doc_type} ${version}`,
      });
    }),
    http.get(`${BASE}/v1/legal/status`, () => HttpResponse.json(status)),
    http.post(`${BASE}/v1/legal/acceptances`, async ({ request }) => {
      acceptBodies.push(await request.json());
      return HttpResponse.json(statusFor(ALL_CURRENT));
    }),
  );
}

function renderModal(queryClient = newQueryClient()) {
  render(QueryHost, {
    props: hostProps(queryClient, LegalReacceptanceModal, {}),
  });
  return queryClient;
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const legalDialog = () => screen.queryByRole('dialog', { name: /review updated legal documents/i });
const acceptButton = () =>
  screen.getByRole('button', { name: /accept and continue/i }) as HTMLButtonElement;

async function waitForForm() {
  await waitFor(() => expect(screen.getByRole('button', { name: /accept and continue/i })));
}

async function tickAll() {
  for (const checkbox of screen.getAllByRole('checkbox')) await fireEvent.click(checkbox);
}

beforeEach(() => {
  acceptBodies = [];
  silentRefresh.mockReset();
  silentRefresh.mockResolvedValue({ ok: true });
  resetLegalState();
  markLegalReacceptanceRequired();
});

afterEach(() => cleanup());

describe('LegalReacceptanceModal — account closure (U1)', () => {
  it('opens deletion instead of the blocker', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    renderModal();
    await waitForForm();

    await fireEvent.click(screen.getByRole('button', { name: /close my account/i }));

    expect(legalDialog()).toBeNull();
    const deletion = screen.getByRole('dialog', { name: /delete account/i });
    await waitFor(() => expect(deletion.contains(document.activeElement)).toBe(true));
  });

  it('cancel returns to the blocker', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    renderModal();
    await waitForForm();
    await fireEvent.click(screen.getByRole('button', { name: /close my account/i }));

    await fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('dialog', { name: /delete account/i })).toBeNull();
    const dialog = legalDialog();
    expect(dialog).not.toBeNull();
    await waitFor(() => expect(dialog!.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /close my account/i }));
    expect(get(legalReacceptanceRequired)).toBe(true);
  });

  it('focus trap is inactive while deletion is open', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    renderModal();
    await waitForForm();
    await fireEvent.click(screen.getByRole('button', { name: /close my account/i }));

    const deletion = screen.getByRole('dialog', { name: /delete account/i });
    const cancel = within(deletion).getByRole('button', { name: /^cancel$/i });
    cancel.focus();
    const notPrevented = await fireEvent.keyDown(cancel, { key: 'Tab' });

    expect(notPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(legalDialog()).toBeNull();
  });
});

describe('LegalReacceptanceModal — authoritative status (U2)', () => {
  it('cached all_satisfied does not dismiss', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    const queryClient = newQueryClient();
    queryClient.setQueryData(legalKeys.status(), statusFor(ALL_CURRENT));

    renderModal(queryClient);
    await waitForForm();

    expect(silentRefresh).not.toHaveBeenCalled();
    expect(get(legalReacceptanceRequired)).toBe(true);
    expect(screen.getByText('Privacy Policy', { selector: '.document-row span' })).toBeTruthy();
  });

  it('fresh all_satisfied dismisses', async () => {
    useServerState(ALL_CURRENT);
    const queryClient = newQueryClient();
    queryClient.setQueryData(legalKeys.status(), statusFor(PRIVACY_UNSATISFIED));

    renderModal(queryClient);

    await waitFor(() => expect(get(legalReacceptanceRequired)).toBe(false));
    expect(silentRefresh).toHaveBeenCalledTimes(1);
    expect(acceptBodies).toHaveLength(0);
  });

  it('network refresh failure is retryable', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    silentRefresh.mockResolvedValueOnce({ ok: false, reason: 'network' });
    renderModal();
    await waitForForm();
    await tickAll();
    await waitFor(() => expect(acceptButton().disabled).toBe(false));

    await fireEvent.click(acceptButton());

    await waitFor(() => expect(screen.getByText(/couldn't refresh your session/i)).toBeTruthy());
    expect(acceptBodies).toHaveLength(1);
    expect(get(legalReacceptanceRequired)).toBe(true);

    await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(get(legalReacceptanceRequired)).toBe(false));
    expect(silentRefresh).toHaveBeenCalledTimes(2);
    expect(acceptBodies).toHaveLength(1);
  });

  it('leaves a terminal refresh failure to the auth flow', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    silentRefresh.mockResolvedValueOnce({ ok: false, reason: 'invalid_token' });
    renderModal();
    await waitForForm();
    await tickAll();
    await waitFor(() => expect(acceptButton().disabled).toBe(false));

    await fireEvent.click(acceptButton());

    await waitFor(() => expect(silentRefresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/couldn't refresh your session/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it.each(['current', 'status'] as const)(
    'submit disabled while /%s is refetching',
    async (endpoint) => {
      useServerState(PRIVACY_UNSATISFIED);
      const queryClient = renderModal();
      await waitForForm();
      await tickAll();
      await waitFor(() => expect(acceptButton().disabled).toBe(false));

      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      server.use(
        http.get(`${BASE}/v1/legal/${endpoint}`, async () => {
          await gate;
          return endpoint === 'status'
            ? HttpResponse.json(statusFor(PRIVACY_UNSATISFIED))
            : HttpResponse.json({
                documents: TYPES.map((doc_type) => ({
                  doc_type,
                  version: PRIVACY_UNSATISFIED[doc_type].current,
                  sha256: SHA[doc_type],
                  requires_reacceptance: true,
                })),
              });
        }),
      );
      const key = endpoint === 'status' ? legalKeys.status() : legalKeys.current();
      void queryClient.refetchQueries({ queryKey: key });

      await waitFor(() => expect(acceptButton().disabled).toBe(true));
      release();
      await waitFor(() => expect(acceptButton().disabled).toBe(false));
    },
  );
});

describe('LegalReacceptanceModal — displayed set (M1, U3)', () => {
  it('newer non-required version is displayed and ticked', async () => {
    useServerState({
      ...ALL_CURRENT,
      // Satisfied (required V1), yet the submitted V2 has never been shown to the user.
      terms: { current: V2, required: V1, accepted: V1 },
      privacy: { current: V2, required: V2, accepted: V1 },
    });
    renderModal();
    await waitForForm();

    const rows = Array.from(document.querySelectorAll('.document-row span')).map(
      (row) => row.textContent,
    );
    expect(rows).toEqual(['Terms of Use', 'Privacy Policy']);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1);
    const label = checkboxes[0].closest('label')!;
    expect(within(label).getByRole('link', { name: 'Terms of Use' })).toBeTruthy();
    expect(within(label).getByRole('link', { name: 'Privacy Policy' })).toBeTruthy();

    expect(acceptButton().disabled).toBe(true);
    await fireEvent.click(checkboxes[0]);
    await waitFor(() => expect(acceptButton().disabled).toBe(false));
  });

  it('already-current documents stay hidden but are submitted', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    renderModal();
    await waitForForm();

    const rows = Array.from(document.querySelectorAll('.document-row span')).map(
      (row) => row.textContent,
    );
    expect(rows).toEqual(['Privacy Policy']);
    expect(screen.queryByText(/sensitive information/i)).toBeNull();

    await tickAll();
    await waitFor(() => expect(acceptButton().disabled).toBe(false));
    await fireEvent.click(acceptButton());

    await waitFor(() => expect(acceptBodies).toHaveLength(1));
    expect(acceptBodies[0]).toEqual({
      accepted_documents: [
        { doc_type: 'terms', version: V1, sha256: SHA.terms },
        { doc_type: 'privacy', version: V2, sha256: SHA.privacy },
        { doc_type: 'sensitive_data_consent', version: V1, sha256: SHA.sensitive_data_consent },
      ],
    });
  });

  it('clears ticks when /current changes content behind the open blocker', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    const queryClient = renderModal();
    await waitForForm();
    await tickAll();
    await waitFor(() => expect(acceptButton().disabled).toBe(false));

    const V3 = '2026-12-01';
    useServerState({
      ...PRIVACY_UNSATISFIED,
      privacy: { current: V3, required: V3, accepted: V1 },
    });
    await queryClient.refetchQueries({ queryKey: legalKeys.all });

    await waitFor(() =>
      expect(screen.getAllByRole('checkbox').every((c) => !(c as HTMLInputElement).checked)).toBe(
        true,
      ),
    );
    expect(acceptButton().disabled).toBe(true);
  });

  it('shows the load-error state when an unsatisfied set has nothing to display', async () => {
    const status = statusFor(ALL_CURRENT);
    status.documents[1] = { ...status.documents[1], satisfied: false };
    status.all_satisfied = false;
    useServerState(ALL_CURRENT, status);
    renderModal();

    await waitFor(() =>
      expect(screen.getByText(/couldn't load the current legal documents/i)).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: /accept and continue/i })).toBeNull();
  });

  it('links the consent row to the consent page', async () => {
    useServerState({
      ...ALL_CURRENT,
      sensitive_data_consent: { current: V2, required: V2, accepted: V1 },
    });
    renderModal();
    await waitForForm();

    const row = screen
      .getByText('Sensitive-data consent', { selector: '.document-row span' })
      .closest('.document-row') as HTMLElement;
    expect(within(row).getByRole('link').getAttribute('href')).toBe(`/consent?version=${V2}`);
  });

  it('keeps legal links visible after a successful acceptance (M2)', async () => {
    useServerState(PRIVACY_UNSATISFIED);
    renderModal();
    await waitForForm();
    await waitFor(() => expect(get(hasLegalDocuments)).toBe(true));
    const emitted: boolean[] = [];
    const unsubscribe = hasLegalDocuments.subscribe((value) => emitted.push(value));

    await tickAll();
    await waitFor(() => expect(acceptButton().disabled).toBe(false));
    await fireEvent.click(acceptButton());
    await waitFor(() => expect(get(legalReacceptanceRequired)).toBe(false));

    unsubscribe();
    expect(emitted).not.toContain(false);
  });
});
