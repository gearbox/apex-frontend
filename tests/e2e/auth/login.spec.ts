import { test, expect } from '@playwright/test';
import { jsonRoute } from '../helpers/api';

const mockTokenResponse = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  expires_in: 900,
  expires_at: new Date(Date.now() + 900_000).toISOString(),
  content_cookie_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
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

test.describe('Login page @cross-browser', () => {
  test('1. Successful login redirects to /app/create', async ({ page }) => {
    await page.route('**/v1/auth/login', jsonRoute(mockTokenResponse));
    await page.route('**/v1/auth/refresh', jsonRoute(mockTokenResponse));
    await page.route('**/v1/users/me', jsonRoute(mockUserProfile));
    await page.route(
      '**/v1/billing/balance',
      jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 500 }),
    );
    await page.route(
      '**/v1/grok',
      jsonRoute({ provider: 'grok', name: 'xAI Grok', available: true, models: [] }),
    );
    await page.route('**/v1/billing/pricing', jsonRoute([]));

    await page.goto('/login');

    await page.getByLabel('Email').fill('e2e@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/app\/create/);
  });

  test('2. Invalid credentials shows error message on form', async ({ page }) => {
    await page.route(
      '**/v1/auth/login',
      jsonRoute(
        { error: 'invalid_credentials', message: 'Invalid email or password', status_code: 401 },
        401,
      ),
    );

    await page.goto('/login');

    await page.getByLabel('Email').fill('bad@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.locator('.text-danger')).toBeVisible();
    await expect(page.locator('.text-danger')).toContainText('Invalid email or password');
  });

  test('3. Unauthenticated redirect: navigating to /app/create without a session', async ({
    page,
  }) => {
    // Ensure no refresh token is planted
    await page.goto('/app/create');

    await expect(page).toHaveURL(/\/login/);
  });

  test('4. Redirect preservation: logs in and lands on originally requested page', async ({
    page,
  }) => {
    // Set up all mocks upfront before any navigation.
    // After login, (app)/+layout.svelte mounts and calls initAuth() with the new refresh token;
    // the refresh mock must succeed so auth stays valid and the redirect is not undone.
    await page.route('**/v1/auth/login', jsonRoute(mockTokenResponse));
    await page.route('**/v1/auth/refresh', jsonRoute(mockTokenResponse));
    await page.route('**/v1/users/me', jsonRoute(mockUserProfile));
    await page.route(
      '**/v1/billing/balance',
      jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 500 }),
    );
    await page.route(
      '**/v1/library*',
      jsonRoute({ items: [], limit: 20, has_more: false, next_cursor: null }),
    );

    // Navigate to a protected page — no session → redirect to /login?redirect=/app/library
    await page.goto('/app/library');
    await expect(page).toHaveURL(/\/login.*redirect.*library/);

    await page.getByLabel('Email').fill('e2e@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/app\/library/, { timeout: 8000 });
  });

  test('5. Security notice: a persisted token_reuse_detected reason shows the security banner once', async ({
    page,
  }) => {
    // Simulates the 401 middleware's hard redirect, which persists the reason to sessionStorage
    // (see stores/auth.ts, setAuthFailureReason) before the login screen ever mounts. Init scripts
    // also run on reload, so retain a test-only sentinel to plant the marker only once.
    await page.addInitScript((reason) => {
      const initializedKey = 'e2e-auth-failure-reason-initialized';
      if (sessionStorage.getItem(initializedKey) === null) {
        sessionStorage.setItem('apex-auth-failure-reason', reason);
        sessionStorage.setItem(initializedKey, 'true');
      }
    }, 'token_reuse_detected');

    await page.goto('/login');

    await expect(page.getByText('Security notice')).toBeVisible();
    await expect(page.getByText(/refresh token was reused/i)).toBeVisible();

    // One-shot: the marker is consumed on mount, so a reload must not re-show it.
    await page.reload();
    await expect(page.getByText('Security notice')).not.toBeVisible();
  });

  test('6. Account deactivated: a persisted account_inactive reason shows the deactivation banner', async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      sessionStorage.setItem('apex-auth-failure-reason', value);
    }, 'account_inactive');

    await page.goto('/login');

    await expect(page.getByText('Your account has been deactivated.')).toBeVisible();
  });

  test('7. Ordinary session end: an invalid_token reason stays silent (no banner)', async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      sessionStorage.setItem('apex-auth-failure-reason', value);
    }, 'invalid_token');

    await page.goto('/login');

    await expect(page.getByText('Security notice')).not.toBeVisible();
    await expect(page.getByText('Your account has been deactivated.')).not.toBeVisible();
  });
});
