import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { LegalDocType } from '$lib/api/legal';
import { resetLegalState, setCurrentLegalDocuments } from '$lib/stores/legal';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import DeleteAccountModal from './DeleteAccountModal.svelte';
import QueryHost, { hostProps } from '../legal/testing/QueryHost.svelte';

const CONSENT_NOTE = /withdraws your consent/i;

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(QueryHost, {
    props: hostProps(queryClient, DeleteAccountModal, { onclose: () => {} }),
  });
}

function setCurrent(types: LegalDocType[]) {
  setCurrentLegalDocuments(
    types.map((doc_type) => ({
      doc_type,
      version: '2026-10-01',
      sha256: 'a'.repeat(64),
      requires_reacceptance: true,
    })),
  );
}

beforeEach(() => resetLegalState());
afterEach(() => cleanup());

describe('DeleteAccountModal', () => {
  it('shows the consent-withdrawal note when the product requires sensitive-data consent', () => {
    setCurrent(['terms', 'privacy', 'sensitive_data_consent']);
    renderModal();
    expect(screen.queryByText(CONSENT_NOTE)).not.toBeNull();
  });

  it('omits the note for a product without legal documents', () => {
    setCurrent([]);
    renderModal();
    expect(screen.queryByText(CONSENT_NOTE)).toBeNull();
  });

  it('omits the note when the current set has no sensitive-data consent', () => {
    setCurrent(['terms', 'privacy']);
    renderModal();
    expect(screen.queryByText(CONSENT_NOTE)).toBeNull();
  });

  it('moves focus into the confirmation field on open', () => {
    renderModal();
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });
});
