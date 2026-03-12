import { test, expect } from '@playwright/test';
import { jsonRoute } from '../helpers/api';

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

test.describe('Login page', () => {
  test('1. Successful login redirects to /app/create', async ({ page }) => {
    await page.route('**/v1/auth/login', jsonRoute(mockTokenResponse));
    await page.route('**/v1/auth/refresh', jsonRoute(mockTokenResponse));
    await page.route('**/v1/users/me', jsonRoute(mockUserProfile));
    await page.route('**/v1/billing/balance', jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 500 }));
    await page.route('**/v1/grok', jsonRoute({ provider: 'grok', name: 'xAI Grok', available: true, models: [] }));
    await page.route('**/v1/billing/pricing', jsonRoute([]));

    await page.goto('/login');

    await page.getByLabel('Email').fill('e2e@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/app\/create/);
  });

  test('2. Invalid credentials shows error message on form', async ({ page }) => {
    await page.route('**/v1/auth/login', jsonRoute(
      { error: 'invalid_credentials', detail: 'Invalid email or password' },
      401,
    ));

    await page.goto('/login');

    await page.getByLabel('Email').fill('bad@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.locator('.text-danger')).toBeVisible();
    await expect(page.locator('.text-danger')).toContainText('invalid_credentials');
  });

  test('3. Unauthenticated redirect: navigating to /app/create without a session', async ({ page }) => {
    // Ensure no refresh token is planted
    await page.goto('/app/create');

    await expect(page).toHaveURL(/\/login/);
  });

  test('4. Redirect preservation: logs in and lands on originally requested page', async ({ page }) => {
    // Set up all mocks upfront before any navigation.
    // After login, (app)/+layout.svelte mounts and calls initAuth() with the new refresh token;
    // the refresh mock must succeed so auth stays valid and the redirect is not undone.
    await page.route('**/v1/auth/login', jsonRoute(mockTokenResponse));
    await page.route('**/v1/auth/refresh', jsonRoute(mockTokenResponse));
    await page.route('**/v1/users/me', jsonRoute(mockUserProfile));
    await page.route('**/v1/billing/balance', jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 500 }));
    await page.route('**/v1/users/me/jobs*', jsonRoute({ items: [], total: 0 }));

    // Navigate to a protected page — no session → redirect to /login?redirect=/app/gallery
    await page.goto('/app/gallery');
    await expect(page).toHaveURL(/\/login.*redirect.*gallery/);

    await page.getByLabel('Email').fill('e2e@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/app\/gallery/, { timeout: 8000 });
  });
});
