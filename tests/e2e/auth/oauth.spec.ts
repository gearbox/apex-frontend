import { expect, test, type Page } from '@playwright/test';
import { jsonRoute } from '../helpers/api';

const token = {
  access_token: 'oauth-access-token',
  refresh_token: 'oauth-refresh-token',
  token_type: 'bearer',
  expires_in: 900,
  expires_at: new Date(Date.now() + 900_000).toISOString(),
  content_cookie_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
};

const user = {
  id: 'oauth-user',
  email: 'oauth@example.com',
  display_name: 'OAuth User',
  subscription_tier: 'free',
  email_verified: true,
  has_password: false,
  role: 'user',
  age_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const legalDocuments = [
  { doc_type: 'terms', version: '2026-10-01', sha256: 'a'.repeat(64) },
  { doc_type: 'privacy', version: '2026-10-01', sha256: 'b'.repeat(64) },
  {
    doc_type: 'sensitive_data_consent',
    version: '2026-10-01',
    sha256: 'c'.repeat(64),
  },
];

/**
 * WebKit cannot fulfill an intercepted request with an HTTP redirect. Returning a tiny document
 * keeps the full-page OAuth navigation realistic while making the fake provider work in every
 * Playwright browser.
 */
function redirectDocument(destination: string): string {
  const serializedDestination = JSON.stringify(destination).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><script>location.replace(${serializedDestination})</script>`;
}

async function mockFreshAuth(page: Page) {
  await page.route('**/v1/auth/oauth/exchange', jsonRoute(token));
  await page.route('**/v1/auth/oauth/complete-signup', jsonRoute(token, 201));
  await page.route('**/v1/auth/refresh', jsonRoute(token));
  await page.route('**/v1/users/me', jsonRoute(user));
}

test.describe('Google OAuth @cross-browser', () => {
  test('redeems a login callback once and removes its hash', async ({ page }) => {
    await mockFreshAuth(page);
    let exchangeCalls = 0;
    await page.route('**/v1/auth/oauth/exchange', (route) => {
      exchangeCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(token),
      });
    });
    await page.route(
      '**/v1/auth/product-info',
      jsonRoute({
        product: 'vex',
        display_name: 'Vex.pics',
        age_gate: 'none',
        allowed_auth_methods: ['google_oauth'],
        content_rating: 'permissive',
        payment_providers: [],
      }),
    );
    await page.route('**/v1/auth/oauth/google/authorize*', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: redirectDocument(
          'http://localhost:4173/auth/callback#result=login&code=c1&return_to=%2Fapp%2Flibrary',
        ),
      }),
    );

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Google' }).click();

    await expect(page).toHaveURL(/\/app\/library$/);
    expect(page.url()).not.toContain('#');
    expect(exchangeCalls).toBe(1);
  });

  test('completes OAuth signup and clears the tab handoff', async ({ page }) => {
    await mockFreshAuth(page);
    await page.route(
      '**/v1/auth/oauth/signup-info',
      jsonRoute({ email: 'oauth@example.com', provider: 'google' }),
    );
    await page.route('**/v1/legal/current', jsonRoute({ documents: legalDocuments }));
    await page.route('**/v1/legal/documents/*', (route) => {
      const doc = legalDocuments.find((item) => route.request().url().includes(item.doc_type));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...doc, content_md: '# Document' }),
      });
    });

    await page.goto('/auth/callback#result=signup&ticket=t1');
    await expect(page.getByText('oauth@example.com')).toBeVisible();
    const legalCheckboxes = page.getByRole('checkbox');
    await expect(legalCheckboxes).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) await legalCheckboxes.nth(index).check();

    const createAccount = page.getByRole('button', { name: /create account/i });
    await expect(createAccount).toBeEnabled();
    await createAccount.click();

    await expect(page).toHaveURL(/\/app\/create$/);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('apex:oauth:pending-signup')))
      .toBeNull();
  });

  test('shows a callback error and restarts through authorize', async ({ page }) => {
    await page.route('**/v1/auth/oauth/google/authorize*', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: redirectDocument('http://localhost:4173/login'),
      }),
    );
    await page.goto('/auth/callback#result=error&error=flow_expired');
    await expect(page.getByText(/sign-in session expired/i)).toBeVisible();

    const authorizeRequest = page.waitForRequest('**/v1/auth/oauth/google/authorize*');
    await page.getByRole('button', { name: 'Try again' }).click();
    await authorizeRequest;
  });
});
