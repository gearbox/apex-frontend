import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { resetLegalState, setCurrentLegalDocuments } from '$lib/stores/legal';

vi.mock('$app/environment', () => ({ browser: true }));

import LegalSection from './LegalSection.svelte';
import QueryHost, { hostProps } from '../legal/testing/QueryHost.svelte';

const VERSION = '2026-10-01';
const ALL_DOCUMENT_TYPES = ['terms', 'privacy', 'sensitive_data_consent'] as const;

function useLegalStatus(documentTypes: readonly (typeof ALL_DOCUMENT_TYPES)[number][]) {
  server.use(
    http.get(`${BASE}/v1/legal/status`, () =>
      HttpResponse.json({
        documents: documentTypes.map((doc_type) => ({
          doc_type,
          required_version: VERSION,
          current_version: VERSION,
          accepted_version: VERSION,
          accepted_at: `${VERSION}T00:00:00Z`,
          satisfied: true,
        })),
        all_satisfied: true,
      }),
    ),
  );
}

function renderLegalSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(QueryHost, {
    props: hostProps(queryClient, LegalSection, { oncloseaccount: () => {} }),
  });
}

beforeEach(() => {
  resetLegalState();
  setCurrentLegalDocuments(
    ALL_DOCUMENT_TYPES.map((doc_type) => ({
      doc_type,
      version: VERSION,
      sha256: 'a'.repeat(64),
      requires_reacceptance: true,
    })),
  );
});

afterEach(() => cleanup());

describe('LegalSection', () => {
  it.each([
    ['Terms of Use', `/terms?version=${VERSION}`],
    ['Privacy Policy', `/privacy?version=${VERSION}`],
    ['Sensitive-data consent', `/consent?version=${VERSION}`],
  ])('links the %s row to its own accepted version', async (label, href) => {
    useLegalStatus(ALL_DOCUMENT_TYPES);
    renderLegalSection();

    const name = await waitFor(() => screen.getByText(label, { selector: '.document-name' }));
    const row = name.closest('.document') as HTMLElement;
    expect(within(row).getByRole('link').getAttribute('href')).toBe(href);
  });

  it('shows the withdrawal note and account-closure link when consent is current', async () => {
    useLegalStatus(ALL_DOCUMENT_TYPES);
    renderLegalSection();

    await waitFor(() => expect(screen.getByText(/withdrawing consent/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /close my account/i })).toBeTruthy();
  });

  it('hides the withdrawal note without sensitive-data consent but keeps the document rows', async () => {
    const documentTypes = ['terms', 'privacy'] as const;
    setCurrentLegalDocuments(
      documentTypes.map((doc_type) => ({
        doc_type,
        version: VERSION,
        sha256: 'a'.repeat(64),
        requires_reacceptance: true,
      })),
    );
    useLegalStatus(documentTypes);
    renderLegalSection();

    await waitFor(() => expect(screen.getByText('Terms of Use')).toBeTruthy());
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.queryByText(/withdrawing consent/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /close my account/i })).toBeNull();
  });
});
