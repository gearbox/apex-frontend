import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const OLD = '2026-10-01';
const NEW = '2026-11-01';
const TYPES = ['terms', 'privacy', 'sensitive_data_consent'] as const;
const SHA = { terms: 'a', privacy: 'b', sensitive_data_consent: 'c' } as const;
type LegalDocType = (typeof TYPES)[number];

interface LegalState {
  current: string;
  required: string;
  accepted: string | null;
}

type LegalStates = Record<LegalDocType, LegalState>;

/** Privacy has a new required version; the other documents are accepted at their current one. */
const PRIVACY_UPDATE: LegalStates = {
  terms: { current: OLD, required: OLD, accepted: OLD },
  privacy: { current: NEW, required: NEW, accepted: OLD },
  sensitive_data_consent: { current: OLD, required: OLD, accepted: OLD },
};

/** Terms has a newer non-required version, while Privacy still requires re-acceptance. */
const TWO_DOCUMENT_UPDATE: LegalStates = {
  ...PRIVACY_UPDATE,
  terms: { current: NEW, required: OLD, accepted: OLD },
};

function statusFor(states: LegalStates) {
  const documents = TYPES.map((doc_type) => {
    const { current, required, accepted } = states[doc_type];
    return {
      doc_type,
      required_version: required,
      current_version: current,
      accepted_version: accepted,
      accepted_at: accepted ? `${accepted}T00:00:00Z` : null,
      satisfied: accepted !== null && accepted >= required,
    };
  });
  return { documents, all_satisfied: documents.every((document) => document.satisfied) };
}

function acceptedStatusFor(states: LegalStates) {
  return {
    documents: TYPES.map((doc_type) => {
      const { current, required } = states[doc_type];
      return {
        doc_type,
        required_version: required,
        current_version: current,
        accepted_version: current,
        accepted_at: `${current}T00:00:00Z`,
        satisfied: true,
      };
    }),
    all_satisfied: true,
  };
}

async function mockLegal(target: Page | BrowserContext, states: LegalStates = PRIVACY_UPDATE) {
  await target.route(
    '**/v1/legal/current',
    jsonRoute({
      documents: TYPES.map((doc_type) => ({
        doc_type,
        version: states[doc_type].current,
        sha256: SHA[doc_type].repeat(64),
        requires_reacceptance: true,
      })),
    }),
  );
  await target.route(/\/v1\/legal\/documents\/[a-z_]+/, (route) => {
    const url = new URL(route.request().url());
    const doc_type = url.pathname.split('/').pop() as LegalDocType;
    const version = url.searchParams.get('version') ?? states[doc_type].current;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        doc_type,
        version,
        sha256: SHA[doc_type].repeat(64),
        requires_reacceptance: true,
        content_md: `# ${doc_type}\n\nVersion ${version}.`,
      }),
    });
  });
  await target.route('**/v1/legal/status', jsonRoute(statusFor(states)));
  await target.route('**/v1/legal/acceptances', jsonRoute(acceptedStatusFor(states)));
}

test.describe('Legal re-acceptance blocker', () => {
  test(
    'FC16: "Close my account" replaces the blocker and cancelling returns to it',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      await mockLegal(page);
      await page.route('**/v1/users/me/stats', jsonRoute({}));

      await page.goto('/app/profile');
      await page.getByRole('button', { name: 'Review updated documents' }).click();

      const blocker = page.getByRole('dialog', { name: 'Review updated legal documents' });
      await expect(blocker).toBeVisible();
      await expect(blocker.getByRole('button', { name: 'Accept and continue' })).toBeVisible();

      await blocker.getByRole('button', { name: 'Close my account' }).click();

      const deletion = page.getByRole('dialog', { name: 'Delete Account' });
      await expect(deletion).toBeVisible();
      await expect(blocker).toHaveCount(0);

      // Usable: focused, typeable, on top, and the confirm control reacts to input.
      const confirmInput = deletion.getByRole('textbox');
      await expect(confirmInput).toBeFocused();
      await confirmInput.fill('DELETE');
      await expect(deletion.getByRole('button', { name: 'Delete my account' })).toBeEnabled();
      await expect(deletion.getByRole('button', { name: 'Cancel' })).toBeInViewport();

      await deletion.getByRole('button', { name: 'Cancel' }).click();

      await expect(deletion).toHaveCount(0);
      await expect(blocker).toBeVisible();
      await expect(blocker.getByRole('button', { name: 'Close my account' })).toBeFocused();
    },
  );

  test(
    'FC17: two public Read pages never refresh the shared session, then acceptance completes',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      const context = page.context();
      let popupRefreshRequests = 0;

      await mockLegal(context, TWO_DOCUMENT_UPDATE);
      await page.route('**/v1/users/me/stats', jsonRoute({}));
      // The authenticated fixture owns main-page refreshes. This context handler only sees
      // popups, where any refresh would prove the public legal layout touched the session.
      await context.route('**/v1/auth/refresh', (route) => {
        if (route.request().frame().page() !== page) popupRefreshRequests += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'e2e-access-token',
            refresh_token: 'e2e-refresh-token',
            token_type: 'bearer',
            expires_in: 900,
            expires_at: new Date(Date.now() + 900_000).toISOString(),
          }),
        });
      });

      await page.goto('/app/profile');
      await page.getByRole('button', { name: 'Review updated documents' }).click();

      const blocker = page.getByRole('dialog', { name: 'Review updated legal documents' });
      await expect(blocker).toBeVisible();
      const readLinks = blocker.getByRole('link', { name: 'Read' });
      await expect(readLinks).toHaveCount(2);

      const firstPagePromise = context.waitForEvent('page');
      await readLinks.nth(0).click();
      const firstPage = await firstPagePromise;

      const secondPagePromise = context.waitForEvent('page');
      await readLinks.nth(1).click();
      const secondPage = await secondPagePromise;

      await Promise.all([firstPage.waitForLoadState(), secondPage.waitForLoadState()]);
      await expect(
        firstPage.getByRole('heading', { name: 'Terms of Use', exact: true }),
      ).toBeVisible();
      await expect(
        secondPage.getByRole('heading', { name: 'Privacy Policy', exact: true }),
      ).toBeVisible();
      expect(popupRefreshRequests).toBe(0);

      await Promise.all([firstPage.close(), secondPage.close()]);
      await expect(blocker).toBeVisible();
      for (const checkbox of await blocker.getByRole('checkbox').all()) await checkbox.check();
      await blocker.getByRole('button', { name: 'Accept and continue' }).click();

      await expect(blocker).toHaveCount(0);
      await expect(page).toHaveURL(/\/app\/profile$/);
      expect(popupRefreshRequests).toBe(0);
    },
  );
});
