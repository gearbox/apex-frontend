import { derived, writable } from 'svelte/store';
import type { LegalDocumentMeta } from '$lib/api/legal';

const currentDocuments = writable<LegalDocumentMeta[] | null>(null);

/** Visible only after `/v1/legal/current` has established that this product has documents. */
export const hasLegalDocuments = derived(
  currentDocuments,
  ($documents) => ($documents?.length ?? 0) > 0,
);

/** True only for products whose current set asks for sensitive-data processing consent. */
export const requiresSensitiveConsent = derived(
  currentDocuments,
  ($documents) =>
    $documents?.some((document) => document.doc_type === 'sensitive_data_consent') ?? false,
);

/** A fresh 428 blocks all app mutations until the user completes the re-acceptance flow. */
export const legalReacceptanceRequired = writable(false);

export function setCurrentLegalDocuments(documents: LegalDocumentMeta[]): void {
  currentDocuments.set(documents);
}

export function markLegalReacceptanceRequired(): void {
  legalReacceptanceRequired.set(true);
}

/**
 * Called after a successful re-acceptance. The current document set is still valid, so the
 * legal navigation links must stay visible.
 */
export function clearLegalReacceptance(): void {
  legalReacceptanceRequired.set(false);
}

/** Called only at a session boundary (`resetAppState`): forgets everything about the product. */
export function resetLegalState(): void {
  legalReacceptanceRequired.set(false);
  currentDocuments.set(null);
}
