import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const OLD = '2026-10-01';
const NEW = '2026-11-01';
const TYPES = ['terms', 'privacy', 'sensitive_data_consent'] as const;
const SHA = { terms: 'a', privacy: 'b', sensitive_data_consent: 'c' } as const;

/** Privacy has a new required version; the other documents are accepted at their current one. */
const currentVersion = (type: (typeof TYPES)[number]) => (type === 'privacy' ? NEW : OLD);

async function mockLegal(page: Page) {
  await page.route(
    '**/v1/legal/current',
    jsonRoute({
      documents: TYPES.map((doc_type) => ({
        doc_type,
        version: currentVersion(doc_type),
        sha256: SHA[doc_type].repeat(64),
        requires_reacceptance: true,
      })),
    }),
  );
  await page.route(/\/v1\/legal\/documents\/[a-z_]+/, (route) => {
    const url = new URL(route.request().url());
    const doc_type = url.pathname.split('/').pop() as (typeof TYPES)[number];
    const version = url.searchParams.get('version') ?? currentVersion(doc_type);
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
  await page.route(
    '**/v1/legal/status',
    jsonRoute({
      documents: TYPES.map((doc_type) => ({
        doc_type,
        required_version: currentVersion(doc_type),
        current_version: currentVersion(doc_type),
        accepted_version: OLD,
        accepted_at: `${OLD}T00:00:00Z`,
        satisfied: doc_type !== 'privacy',
      })),
      all_satisfied: false,
    }),
  );
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
});
