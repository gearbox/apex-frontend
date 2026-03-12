import { test as base, expect, type Page, type Route } from '@playwright/test';

const mockTokenResponse = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  expires_in: 900,
  expires_at: new Date(Date.now() + 900_000).toISOString(),
};

const mockUserProfile = {
  id: 'usr_e2e_001',
  email: 'e2e@example.com',
  display_name: 'E2E User',
  subscription_tier: 'free',
  email_verified: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/** Fixture that starts with an authenticated session. */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }: { page: Page }, use: (r: Page) => Promise<void>) => {
    // Intercept refresh to return a valid mock token
    await page.route('**/v1/auth/refresh', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTokenResponse),
      }),
    );

    // Intercept /v1/users/me to return a mock profile
    await page.route('**/v1/users/me', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUserProfile),
      }),
    );

    // Intercept billing balance
    await page.route('**/v1/billing/balance', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account_id: 'acc_001', account_type: 'personal', balance: 500 }),
      }),
    );

    // Plant a refresh token in localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem('apex-refresh-token', 'e2e-refresh-token');
    });

    await use(page);
  },
});

export { expect };
