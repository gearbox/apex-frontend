import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { LegalDocumentMeta } from '$lib/api/legal';
import {
  clearLegalReacceptance,
  hasLegalDocuments,
  legalReacceptanceRequired,
  markLegalReacceptanceRequired,
  requiresSensitiveConsent,
  resetLegalState,
  setCurrentLegalDocuments,
} from './legal';

function meta(doc_type: LegalDocumentMeta['doc_type']): LegalDocumentMeta {
  return { doc_type, version: '2026-10-01', sha256: 'a'.repeat(64), requires_reacceptance: true };
}

beforeEach(() => resetLegalState());

describe('legal store', () => {
  it('starts with no documents and no blocker', () => {
    expect(get(hasLegalDocuments)).toBe(false);
    expect(get(requiresSensitiveConsent)).toBe(false);
    expect(get(legalReacceptanceRequired)).toBe(false);
  });

  it('derives document presence and sensitive consent from the current set', () => {
    setCurrentLegalDocuments([meta('terms'), meta('privacy')]);
    expect(get(hasLegalDocuments)).toBe(true);
    expect(get(requiresSensitiveConsent)).toBe(false);

    setCurrentLegalDocuments([meta('terms'), meta('sensitive_data_consent')]);
    expect(get(requiresSensitiveConsent)).toBe(true);

    setCurrentLegalDocuments([]);
    expect(get(hasLegalDocuments)).toBe(false);
    expect(get(requiresSensitiveConsent)).toBe(false);
  });

  it('clearLegalReacceptance lifts the blocker without hiding legal links', () => {
    setCurrentLegalDocuments([meta('terms')]);
    markLegalReacceptanceRequired();
    const emitted: boolean[] = [];
    const unsubscribe = hasLegalDocuments.subscribe((value) => emitted.push(value));

    clearLegalReacceptance();

    unsubscribe();
    expect(get(legalReacceptanceRequired)).toBe(false);
    expect(emitted).toEqual([true]);
  });

  it('resetLegalState clears both the blocker and the current set', () => {
    setCurrentLegalDocuments([meta('sensitive_data_consent')]);
    markLegalReacceptanceRequired();

    resetLegalState();

    expect(get(legalReacceptanceRequired)).toBe(false);
    expect(get(hasLegalDocuments)).toBe(false);
    expect(get(requiresSensitiveConsent)).toBe(false);
  });
});
