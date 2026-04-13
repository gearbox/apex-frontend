import { test, expect } from '../fixtures/auth.fixture';

test.describe('Offline Banner', () => {
  test('shows offline banner when network is lost and hides when back online', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to app first
    await page.goto('/app/create');
    await page.waitForSelector('[class*="topbar"]');

    // Banner should not be visible initially
    const banner = page.locator('[class*="offline-banner"]');
    await expect(banner).not.toBeVisible();

    // Go offline
    await page.context().setOffline(true);

    // Trigger the browser's offline event
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Banner should appear
    await expect(banner).toBeVisible();

    // Go back online
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Banner should disappear
    await expect(banner).not.toBeVisible();
  });
});
