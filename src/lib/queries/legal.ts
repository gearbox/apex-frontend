import {
  fetchCurrentLegal,
  fetchLegalDocument,
  fetchLegalStatus,
  type LegalDocType,
} from '$lib/api/legal';
import { setCurrentLegalDocuments } from '$lib/stores/legal';

export const legalKeys = {
  all: ['legal'] as const,
  current: () => [...legalKeys.all, 'current'] as const,
  document: (type: LegalDocType, version: string | 'current') =>
    [...legalKeys.all, 'document', type, version] as const,
  status: () => [...legalKeys.all, 'status'] as const,
};

export function currentLegalQueryOptions() {
  return {
    queryKey: legalKeys.current(),
    queryFn: async () => {
      const documents = await fetchCurrentLegal();
      setCurrentLegalDocuments(documents);
      return documents;
    },
    // The endpoint's ETag/no-cache policy owns freshness for the current alias.
    staleTime: 0,
  };
}

export function legalDocumentQueryOptions(type: LegalDocType, version?: string) {
  return {
    queryKey: legalKeys.document(type, version ?? 'current'),
    queryFn: () => fetchLegalDocument(type, version),
    // Versioned document URLs are immutable. The current alias intentionally is not.
    staleTime: version ? Infinity : 0,
  };
}

export function legalStatusQueryOptions() {
  return {
    queryKey: legalKeys.status(),
    queryFn: fetchLegalStatus,
    staleTime: 0,
  };
}
