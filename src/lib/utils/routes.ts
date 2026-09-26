import type { LegalDocType } from '$lib/api/legal';

export const ROUTES = {
  billing: '/app/billing',
  /** Top-up / checkout entry point linked from credit CTAs. */
  billingTopUp: '/app/billing?tab=buy',
  create: '/app/create',
  library: '/app/library',
  terms: '/terms',
  privacy: '/privacy',
  /** Reached only through versioned "Read" links; intentionally absent from navigation. */
  consent: '/consent',
} as const;

// `satisfies` turns a future document type into a compile error rather than a silent fallback.
const LEGAL_ROUTES = {
  terms: ROUTES.terms,
  privacy: ROUTES.privacy,
  sensitive_data_consent: ROUTES.consent,
} as const satisfies Record<LegalDocType, string>;

/** Public page for a legal document; a version pins the immutable text a user saw or accepted. */
export function legalDocumentHref(type: LegalDocType, version?: string): string {
  const base = LEGAL_ROUTES[type];
  return version ? `${base}?version=${encodeURIComponent(version)}` : base;
}
