import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';

// Contract-shaped Vex fixtures for local development and browser tests. Product-specific tests
// may override `/current` with `[]` to exercise the Synthara no-documents state.
const documents = [
  {
    doc_type: 'terms',
    version: '2026-10-01',
    sha256: 'a'.repeat(64),
    requires_reacceptance: true,
    content_md: '# Terms of Use\n\nThese are the mock Terms of Use.',
  },
  {
    doc_type: 'privacy',
    version: '2026-10-01',
    sha256: 'b'.repeat(64),
    requires_reacceptance: true,
    content_md: '# Privacy Policy\n\nThese are the mock Privacy Policy terms.',
  },
  {
    doc_type: 'sensitive_data_consent',
    version: '2026-10-01',
    sha256: 'c'.repeat(64),
    requires_reacceptance: true,
    content_md: '# Sensitive-data consent\n\nThis is the mock consent statement.',
  },
] as const;

const metadata = documents.map((document) => ({
  doc_type: document.doc_type,
  version: document.version,
  sha256: document.sha256,
  requires_reacceptance: document.requires_reacceptance,
}));

export const legalHandlers = [
  http.get(`${BASE}/v1/legal/current`, () => HttpResponse.json({ documents: metadata })),

  http.get(`${BASE}/v1/legal/documents/:docType`, ({ params, request }) => {
    const document = documents.find((item) => item.doc_type === (params.docType as string));
    const version = new URL(request.url).searchParams.get('version');
    if (!document || (version && version !== document.version)) {
      return HttpResponse.json(
        {
          error: 'legal_document_not_found',
          message: 'Legal document not found',
          status_code: 404,
        },
        { status: 404 },
      );
    }
    return HttpResponse.json(document);
  }),

  http.get(`${BASE}/v1/legal/status`, () =>
    HttpResponse.json({
      documents: metadata.map((document) => ({
        doc_type: document.doc_type,
        required_version: document.version,
        current_version: document.version,
        accepted_version: document.version,
        accepted_at: '2026-10-01T00:00:00Z',
        satisfied: true,
      })),
      all_satisfied: true,
    }),
  ),

  http.post(`${BASE}/v1/legal/acceptances`, () =>
    HttpResponse.json({
      documents: metadata.map((document) => ({
        doc_type: document.doc_type,
        required_version: document.version,
        current_version: document.version,
        accepted_version: document.version,
        accepted_at: '2026-10-01T00:00:00Z',
        satisfied: true,
      })),
      all_satisfied: true,
    }),
  ),
];
