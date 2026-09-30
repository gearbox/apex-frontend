import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../../mocks/factories/user';
import { feedbackDialog } from '$lib/stores/feedbackDialog.svelte';
import {
  legalReacceptanceRequired,
  markLegalReacceptanceRequired,
  resetLegalState,
} from '$lib/stores/legal';
import { feedbackReportFixture } from '../../../mocks/handlers/feedback';
import FeedbackLegalInteractionHost from './testing/FeedbackLegalInteractionHost.svelte';
import QueryHost, { hostProps } from './testing/QueryHost.svelte';

const DOCUMENTS = ['terms', 'privacy', 'sensitive_data_consent'] as const;
const CURRENT_VERSION = '2026-11-01';
const ACCEPTED_VERSION = '2026-10-01';
const HASHES = {
  terms: 'a'.repeat(64),
  privacy: 'b'.repeat(64),
  sensitive_data_consent: 'c'.repeat(64),
};

function useUnsatisfiedLegalState() {
  server.use(
    http.get(`${BASE}/v1/legal/current`, () =>
      HttpResponse.json({
        documents: DOCUMENTS.map((doc_type) => ({
          doc_type,
          version: CURRENT_VERSION,
          sha256: HASHES[doc_type],
          requires_reacceptance: true,
        })),
      }),
    ),
    http.get(`${BASE}/v1/legal/documents/:docType`, ({ params, request }) => {
      const doc_type = params.docType as (typeof DOCUMENTS)[number];
      const version = new URL(request.url).searchParams.get('version') ?? CURRENT_VERSION;
      return HttpResponse.json({
        doc_type,
        version,
        sha256: HASHES[doc_type],
        requires_reacceptance: true,
        content_md: `# ${doc_type} ${version}`,
      });
    }),
    http.get(`${BASE}/v1/legal/status`, () =>
      HttpResponse.json({
        documents: DOCUMENTS.map((doc_type) => {
          const accepted_version = doc_type === 'privacy' ? ACCEPTED_VERSION : CURRENT_VERSION;
          return {
            doc_type,
            required_version: CURRENT_VERSION,
            current_version: CURRENT_VERSION,
            accepted_version,
            accepted_at: `${accepted_version}T00:00:00Z`,
            satisfied: accepted_version === CURRENT_VERSION,
          };
        }),
        all_satisfied: false,
      }),
    ),
    http.post(`${BASE}/v1/legal/acceptances`, () =>
      HttpResponse.json({ all_satisfied: true, documents: [] }),
    ),
  );
}

function renderHost(adminVisible = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(QueryHost, {
    props: hostProps(queryClient, FeedbackLegalInteractionHost, {
      adminVisible,
      reportId: feedbackReportFixture.id,
    }),
  });
}

beforeEach(() => {
  feedbackDialog.reset();
  resetLegalState();
  setAuth(
    {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    makeUserProfile({ role: 'admin' }),
  );
});

afterEach(() => {
  cleanup();
  feedbackDialog.reset();
  resetLegalState();
});

describe('feedback handoff with legal re-acceptance', () => {
  it('lets a blocked user report a problem and returns focus without clearing the blocker', async () => {
    useUnsatisfiedLegalState();
    markLegalReacceptanceRequired();
    let submitted: Record<string, unknown> | undefined;
    let acceptRequests = 0;
    server.use(
      http.post(`${BASE}/v1/feedback`, async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: '55555555-5555-4555-8555-555555555555',
            status: 'open',
            created_at: '2026-09-30T12:00:00Z',
          },
          { status: 201 },
        );
      }),
      http.post(`${BASE}/v1/legal/acceptances`, () => {
        acceptRequests += 1;
        return HttpResponse.json({ all_satisfied: true, documents: [] });
      }),
    );
    renderHost();

    await screen.findByRole('button', { name: 'Accept and continue' });
    const legalDialog = screen.getByRole('dialog', { name: 'Review updated legal documents' });
    const reportButton = within(legalDialog).getByRole('button', { name: 'Report a problem' });
    reportButton.focus();
    await fireEvent.click(reportButton);

    const feedback = await screen.findByRole('dialog', { name: 'Report a problem' });
    const category = within(feedback).getByLabelText('What is this about?') as HTMLSelectElement;
    expect(category.value).toBe('account');
    const message = within(feedback).getByLabelText('What happened?');
    await waitFor(() => expect(document.activeElement).toBe(message));
    await fireEvent.input(message, {
      target: { value: 'The updated privacy document is unclear.' },
    });
    await fireEvent.click(within(feedback).getByRole('button', { name: 'Send report' }));

    await within(feedback).findByText('Thanks — we got your report.');
    expect(submitted).toMatchObject({ category: 'account' });
    expect(get(legalReacceptanceRequired)).toBe(true);

    await fireEvent.click(within(feedback).getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Report a problem' })).toBeNull(),
    );
    expect(screen.getByRole('dialog', { name: 'Review updated legal documents' })).toBeTruthy();
    expect(document.activeElement).toBe(reportButton);
    expect(get(legalReacceptanceRequired)).toBe(true);
    expect(screen.getByRole('button', { name: 'Accept and continue' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(acceptRequests).toBe(0);
  });

  it('yields an admin feedback modal to legal re-acceptance after PATCH 428 without replaying it', async () => {
    useUnsatisfiedLegalState();
    let patchRequests = 0;
    server.use(
      http.patch(`${BASE}/v1/admin/feedback/:report_id`, () => {
        patchRequests += 1;
        return HttpResponse.json(
          { error: 'legal_acceptance_required', message: 'Review required', status_code: 428 },
          { status: 428 },
        );
      }),
    );
    renderHost(true);

    const adminDialog = await screen.findByRole('dialog', { name: 'Feedback report' });
    await within(adminDialog).findByLabelText('Admin note');
    await fireEvent.click(within(adminDialog).getByRole('button', { name: 'Save note' }));

    await screen.findByRole('dialog', { name: 'Review updated legal documents' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Feedback report' })).toBeNull(),
    );
    expect(get(legalReacceptanceRequired)).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Review updated legal documents' })).toBeTruthy();
    await waitFor(() =>
      expect(
        screen
          .getByRole('dialog', { name: 'Review updated legal documents' })
          .contains(document.activeElement),
      ).toBe(true),
    );
    expect(patchRequests).toBe(1);
  });
});
