import { describe, expect, it } from 'vitest';
import { legalDocumentHref, ROUTES } from './routes';

describe('legalDocumentHref', () => {
  it.each([
    ['terms', '/terms'],
    ['privacy', '/privacy'],
    ['sensitive_data_consent', '/consent'],
  ] as const)('maps %s to its own public page', (type, route) => {
    expect(legalDocumentHref(type)).toBe(route);
  });

  it.each([
    ['terms', '/terms?version=2026-10-01'],
    ['privacy', '/privacy?version=2026-10-01'],
    ['sensitive_data_consent', '/consent?version=2026-10-01'],
  ] as const)('pins %s to an exact version', (type, href) => {
    expect(legalDocumentHref(type, '2026-10-01')).toBe(href);
  });

  it('encodes the version query value', () => {
    expect(legalDocumentHref('terms', '2026-10-01 rev&2')).toBe(
      `${ROUTES.terms}?version=2026-10-01%20rev%262`,
    );
  });
});
