import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../mocks/config';
import {
  acceptLegal,
  fetchCurrentLegal,
  fetchLegalDocument,
  toAcceptedDocuments,
  type LegalDocumentMeta,
} from '$lib/api/legal';
import { clearAuth } from '$lib/stores/auth';

const documents: LegalDocumentMeta[] = [
  {
    doc_type: 'terms',
    version: '2026-10-01',
    sha256: 'a'.repeat(64),
    requires_reacceptance: true,
  },
  {
    doc_type: 'privacy',
    version: '2026-10-01',
    sha256: 'b'.repeat(64),
    requires_reacceptance: true,
  },
  {
    doc_type: 'sensitive_data_consent',
    version: '2026-10-01',
    sha256: 'c'.repeat(64),
    requires_reacceptance: true,
  },
];

beforeEach(() => clearAuth());

describe('legal API', () => {
  it('fetches a reviewed document by its exact current version', async () => {
    let requestedVersion: string | null = null;
    server.use(
      http.get(`${BASE}/v1/legal/documents/terms`, ({ request }) => {
        requestedVersion = new URL(request.url).searchParams.get('version');
        return HttpResponse.json({ ...documents[0], content_md: '# Terms' });
      }),
    );

    const document = await fetchLegalDocument('terms', documents[0].version);

    expect(requestedVersion).toBe(documents[0].version);
    expect(document.sha256).toBe(documents[0].sha256);
  });

  it('uses the current alias for a public document when no version is requested', async () => {
    let requestedVersion: string | null = 'not-called';
    server.use(
      http.get(`${BASE}/v1/legal/documents/privacy`, ({ request }) => {
        requestedVersion = new URL(request.url).searchParams.get('version');
        return HttpResponse.json({ ...documents[1], content_md: '# Privacy' });
      }),
    );

    await fetchLegalDocument('privacy');

    expect(requestedVersion).toBeNull();
  });

  it('copies the current metadata verbatim into an acceptance request', async () => {
    let captured: unknown;
    server.use(
      http.get(`${BASE}/v1/legal/current`, () => HttpResponse.json({ documents })),
      http.post(`${BASE}/v1/legal/acceptances`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ documents: [], all_satisfied: true });
      }),
    );

    const current = await fetchCurrentLegal();
    const accepted = toAcceptedDocuments(current);
    await acceptLegal(accepted);

    expect(accepted).toEqual(
      documents.map(({ doc_type, version, sha256 }) => ({ doc_type, version, sha256 })),
    );
    expect(captured).toEqual({ accepted_documents: accepted });
  });
});
