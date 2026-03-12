import { test as authTest, expect } from '../fixtures/auth.fixture';
import { test, expect as baseExpect } from '@playwright/test';
import { jsonRoute } from '../helpers/api';

const mockProviderInfo = {
  provider: 'grok', name: 'xAI Grok', available: true, models: [],
};

test.describe('Navigation routing', () => {
  test('4a. Root / (unauthenticated) redirects to /login', async ({ page }) => {
    await page.route('**/v1/auth/refresh', jsonRoute({ error: 'no_token' }, 401));

    await page.goto('/');

    await baseExpect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

authTest.describe('Navigation routing (authenticated)', () => {
  authTest.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/grok', jsonRoute(mockProviderInfo));
    await page.route('**/v1/billing/pricing', jsonRoute([]));
    await page.route('**/v1/users/me/jobs*', jsonRoute({ items: [], total: 0 }));
  });

  authTest('1. Desktop sidebar visible at ≥768px', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app/create');

    // DesktopSidebar is inside .desktop-shell
    await expect(page.locator('.desktop-shell')).toBeVisible({ timeout: 5000 });
    // Sidebar nav links (Create, Gallery, etc.) should be present
    await expect(page.getByRole('link', { name: /create/i }).first()).toBeVisible();
  });

  authTest('2. Mobile bottom tab bar visible at <768px', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/app/create');

    // MobileBottomTabs is inside .mobile-shell
    await expect(page.locator('.mobile-shell')).toBeVisible({ timeout: 5000 });
    // Desktop sidebar should NOT be visible
    await expect(page.locator('.desktop-shell')).not.toBeVisible();
  });

  authTest('3. More sheet opens on mobile when tapping More', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/app/create');

    // Tap the "More" tab
    await page.getByRole('button', { name: /more/i }).click();

    // MobileMoreSheet should appear
    await expect(page.getByText(/billing|profile|jobs/i).first()).toBeVisible({ timeout: 3000 });
  });

  authTest('4b. Root / (authenticated) redirects to /app/create', async ({ authenticatedPage: page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/app\/create/, { timeout: 5000 });
  });
});
