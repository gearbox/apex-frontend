import apiClient from '$lib/api/client';
import { throwApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';

export type LegalDocType = components['schemas']['LegalDocumentType'];
export type AcceptedDocument = components['schemas']['AcceptedDocument'];
export type LegalDocumentMeta = components['schemas']['LegalDocumentMeta'];
export type LegalDocument = components['schemas']['LegalDocumentResponse'];
export type LegalStatus = components['schemas']['LegalStatusResponse'];

/** Returns the document set required by the active product. This endpoint is public. */
export async function fetchCurrentLegal(): Promise<LegalDocumentMeta[]> {
  const { data, error } = await apiClient.GET('/v1/legal/current');
  if (error || !data) throwApiError(error, 'Failed to fetch legal documents');
  return data.documents;
}

/**
 * Fetch a legal document. Supplying a version is essential in an acceptance UI: the returned
 * markdown is then immutable and matches the metadata that will be echoed back to the API.
 */
export async function fetchLegalDocument(
  docType: LegalDocType,
  version?: string,
): Promise<LegalDocument> {
  const { data, error, response } = await apiClient.GET('/v1/legal/documents/{doc_type}', {
    params: {
      path: { doc_type: docType },
      ...(version ? { query: { version } } : {}),
    },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch legal document', response.status);
  return data;
}

/** Returns the caller's evidence/requirements state. */
export async function fetchLegalStatus(): Promise<LegalStatus> {
  const { data, error } = await apiClient.GET('/v1/legal/status');
  if (error || !data) throwApiError(error, 'Failed to fetch legal status');
  return data;
}

/** Accept the complete document set. This endpoint deliberately works with a stale access token. */
export async function acceptLegal(docs: AcceptedDocument[]): Promise<LegalStatus> {
  const { data, error, response } = await apiClient.POST('/v1/legal/acceptances', {
    body: { accepted_documents: docs },
  });
  if (error || !data) throwApiError(error, 'Failed to accept legal documents', response.status);
  return data;
}

/**
 * The backend's sha256 is evidence for the markdown the person saw. Never hash or normalize it
 * in the browser; this is intentionally a verbatim copy of `/current` metadata.
 */
export function toAcceptedDocuments(current: LegalDocumentMeta[]): AcceptedDocument[] {
  return current.map(({ doc_type, version, sha256 }) => ({ doc_type, version, sha256 }));
}
