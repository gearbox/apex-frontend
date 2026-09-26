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

beforeEach(() => {
  resetLegalState();
  setCurrentLegalDocuments(
    (['terms', 'privacy', 'sensitive_data_consent'] as const).map((doc_type) => ({
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
    server.use(
      http.get(`${BASE}/v1/legal/status`, () =>
        HttpResponse.json({
          documents: (['terms', 'privacy', 'sensitive_data_consent'] as const).map((doc_type) => ({
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
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(QueryHost, {
      props: hostProps(queryClient, LegalSection, { oncloseaccount: () => {} }),
    });

    const name = await waitFor(() => screen.getByText(label, { selector: '.document-name' }));
    const row = name.closest('.document') as HTMLElement;
    expect(within(row).getByRole('link').getAttribute('href')).toBe(href);
  });
});
