import { derived, writable } from 'svelte/store';
import type { LegalDocumentMeta } from '$lib/api/legal';

const currentDocuments = writable<LegalDocumentMeta[] | null>(null);

/** Visible only after `/v1/legal/current` has established that this product has documents. */
export const hasLegalDocuments = derived(
  currentDocuments,
  ($documents) => ($documents?.length ?? 0) > 0,
);

/** A fresh 428 blocks all app mutations until the user completes the re-acceptance flow. */
export const legalReacceptanceRequired = writable(false);

export function setCurrentLegalDocuments(documents: LegalDocumentMeta[]): void {
  currentDocuments.set(documents);
}

export function markLegalReacceptanceRequired(): void {
  legalReacceptanceRequired.set(true);
}

/** Called after a successful re-acceptance and whenever a session boundary is cleared. */
export function resetLegalState(): void {
  legalReacceptanceRequired.set(false);
  currentDocuments.set(null);
}
