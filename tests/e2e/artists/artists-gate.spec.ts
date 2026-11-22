import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const syntharaProduct = {
  product: 'synthara',
  display_name: 'Synthara',
  age_gate: 'none',
  allowed_auth_methods: ['email_password'],
  content_rating: 'sfw',
  payment_providers: ['stripe'],
};
const vexProduct = { ...syntharaProduct, product: 'vex', display_name: 'Vex' };
const artistPage = { items: [], limit: 1, has_more: false, next_cursor: null };

test.describe('Artists capability gate', () => {
  test(
    'does not probe Studio for an unauthenticated app session',
    { tag: '@cross-browser' },
    async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-safari', 'Covered on desktop and mobile Chrome.');
      await page.clock.install();
      await page.route('**/v1/auth/product-info', jsonRoute(syntharaProduct));
      await page.route('**/v1/auth/refresh', jsonRoute({ error: 'no_token' }, 401));
      let probeRequests = 0;
      await page.route('**/v1/studio/artists*', async (route) => {
        probeRequests += 1;
        return route.fulfill({ status: 404 });
      });

      await page.goto('/app/artists');

      await expect(page).toHaveURL(/\/login/);
      expect(probeRequests).toBe(0);
    },
  );

  test(
    'studio 404 redirects to the product home and hides Artists',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-safari', 'Covered on desktop and mobile Chrome.');
      await page.clock.install();
      await page.route('**/v1/auth/product-info', jsonRoute(syntharaProduct));
      await page.route(
        '**/v1/studio/artists*',
        jsonRoute(
          {
            error: 'not_found',
            message: 'Studio is disabled.',
            status_code: 404,
          },
          404,
        ),
      );

      await page.goto('/app/artists');

      await expect(page).toHaveURL(/\/app\/create$/);
      await expect(page.getByRole('link', { name: 'Artists' })).toHaveCount(0);

      await page.goto('/app/artists/artist-disabled');
      await expect(page).toHaveURL(/\/app\/create$/);
      await expect(page.getByRole('link', { name: 'Artists' })).toHaveCount(0);
    },
  );

  test(
    'studio 200 renders the empty Artists state and navigation',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-safari', 'Covered on desktop and mobile Chrome.');
      await page.clock.install();
      await page.route('**/v1/auth/product-info', jsonRoute(syntharaProduct));
      await page.route('**/v1/studio/artists*', jsonRoute(artistPage));

      await page.goto('/app/artists');

      await expect(page.getByRole('heading', { name: "Who's your first artist?" })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Create an artist' })).toBeVisible();
      await expect(page.getByText('Artists are coming soon.')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Artists' })).toBeVisible();
    },
  );

  test(
    'an exhausted probe can recover after the user retries',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-safari', 'Covered on desktop and mobile Chrome.');
      await page.clock.install();
      await page.route('**/v1/auth/product-info', jsonRoute(syntharaProduct));
      let probeStatus = 500;
      let probeRequests = 0;
      await page.route('**/v1/studio/artists*', async (route) => {
        probeRequests += 1;
        if (probeStatus === 200)
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(artistPage),
          });
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'server_error', message: 'Unavailable', status_code: 500 }),
        });
      });

      await page.goto('/app/artists');
      await expect.poll(() => probeRequests).toBeGreaterThanOrEqual(1);
      await page.clock.runFor(1);
      await page.clock.fastForward(30_000);

      await expect(page.getByText("Couldn't check whether Studio is available.")).toBeVisible();
      probeStatus = 200;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByRole('heading', { name: "Who's your first artist?" })).toBeVisible();
      await expect.poll(() => probeRequests).toBeGreaterThanOrEqual(3);
    },
  );

  test(
    'Vex skips the startup probe but a direct Artists URL probes Studio',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-safari', 'Covered on desktop and mobile Chrome.');
      await page.clock.install();
      await page.route('**/v1/auth/product-info', jsonRoute(vexProduct));
      let probeRequests = 0;
      await page.route('**/v1/studio/artists*', async (route) => {
        probeRequests += 1;
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'not_found',
            message: 'Studio is disabled.',
            status_code: 404,
          }),
        });
      });

      const productInfo = page.waitForResponse('**/v1/auth/product-info');
      await page.goto('/app/create');
      await productInfo;
      await expect(page.locator('.desktop-shell, .mobile-shell')).toBeVisible();
      await expect.poll(() => probeRequests).toBe(0);
      await page.goto('/app/artists');
      await expect(page).toHaveURL(/\/app\/create$/);
      await expect.poll(() => probeRequests).toBe(1);
    },
  );
});
