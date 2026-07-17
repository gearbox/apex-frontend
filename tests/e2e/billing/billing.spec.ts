import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

test.describe('Billing', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/billing/pricing', jsonRoute([]));
    await page.route(
      '**/v1/billing/topup/options',
      jsonRoute({
        min_amount_usd: 5,
        max_amount_usd: 1000,
        tokens_per_usd: 100,
        tiers: [{ threshold_usd: 50, discount_pct: 10 }],
      }),
    );
    await page.route(
      '**/v1/billing/providers',
      jsonRoute([{ provider: 'stripe', display_order: 0 }]),
    );
    await page.route('**/v1/billing/currencies', jsonRoute([]));
    await page.route(
      '**/v1/billing/transactions**',
      jsonRoute({ items: [], limit: 100, has_more: false, next_cursor: null }),
    );
  });

  test('the canonical top-up route opens Buy Tokens', async ({ authenticatedPage: page }) => {
    await page.goto('/app/billing?tab=buy');

    await expect(page.getByRole('button', { name: /pay with stripe/i })).toBeVisible();
  });

  test('the legacy buy path redirects to the canonical Buy Tokens URL', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/billing/buy');

    await expect(page).toHaveURL(/\/app\/billing\?tab=buy/);
    await expect(page.getByRole('button', { name: /pay with stripe/i })).toBeVisible();
  });
});
