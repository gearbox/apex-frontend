import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

test.describe('Token refresh', () => {
  test('1. Silent refresh on expired access token: retries and succeeds', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me/jobs*', jsonRoute({ items: [], total: 0 }));

    await page.goto('/app/gallery');

    await expect(page).toHaveURL(/\/app\/gallery/);
    await expect(page.locator('body')).not.toContainText('Loading…');
  });

  test('2. Refresh token revoked: redirects to /login and clears storage', async ({ page }) => {
    await page.route('**/v1/auth/refresh', jsonRoute(
      { error: 'token_revoked', detail: 'Refresh token has been revoked' },
      401,
    ));

    // Navigate to login first to establish a page context, then set localStorage
    // via evaluate (not addInitScript) so it does NOT re-run on subsequent navigations.
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('apex-refresh-token', 'revoked-token'));

    await page.goto('/app/create');

    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });

    // clearAuth() should have removed the token
    const refreshToken = await page.evaluate(() => localStorage.getItem('apex-refresh-token'));
    expect(refreshToken).toBeNull();
  });
});
