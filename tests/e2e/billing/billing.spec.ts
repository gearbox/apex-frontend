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

  test('the default crypto currency is first and full-width on mobile', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.route(
      '**/v1/billing/providers',
      jsonRoute([
        { provider: 'stripe', display_order: 0 },
        { provider: 'nowpayments', display_order: 1 },
      ]),
    );
    await page.route(
      '**/v1/billing/currencies',
      jsonRoute([
        { ticker: 'USDTTRC20', name: 'Tether', network: 'TRX', logo_url: null },
        {
          ticker: 'LONG',
          name: 'A genuinely long currency name that should remain visible',
          network: null,
          logo_url: null,
        },
      ]),
    );

    await page.goto('/app/billing?tab=buy');

    const radios = page.getByRole('radio');
    await expect(radios).toHaveCount(3);
    await expect(radios.nth(0)).toHaveAccessibleName(/other.*choose on payment page/i);

    const defaultBox = await radios.nth(0).locator('..').boundingBox();
    const currencyBox = await radios.nth(1).locator('..').boundingBox();
    expect(defaultBox).not.toBeNull();
    expect(currencyBox).not.toBeNull();
    expect(defaultBox!.width).toBeGreaterThan(currencyBox!.width * 1.8);
    expect(currencyBox!.y).toBeGreaterThan(defaultBox!.y);
    await expect(
      page.getByText('A genuinely long currency name that should remain visible'),
    ).toBeVisible();
  });
});
