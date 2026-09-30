import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const unverified = {
  id: 'usr_e2e_001',
  email: 'e2e@example.com',
  display_name: 'E2E User',
  subscription_tier: 'free',
  role: 'user',
  locale: 'en',
  is_active: true,
  email_verified: false,
  has_password: true,
  age_verified: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

test('resend verification and reconcile profile on focus @cross-browser', async ({
  authenticatedPage: page,
}) => {
  let verified = false;
  let resendCalls = 0;
  await page.route('**/v1/users/me', (route) =>
    jsonRoute({ ...unverified, email_verified: verified })(route),
  );
  await page.route('**/v1/auth/resend-verification', (route) => {
    resendCalls++;
    return jsonRoute({ message: 'Verification email sent' })(route);
  });
  await page.route(
    '**/v1/users/me/stats',
    jsonRoute({
      total_jobs: 0,
      completed_jobs: 0,
      failed_jobs: 0,
      total_outputs: 0,
      total_uploads: 0,
      storage_used_bytes: 0,
    }),
  );

  await page.goto('/app/profile');
  await expect(page.getByText('Not verified')).toBeVisible();
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByText('Verification email sent to e2e@example.com')).toBeVisible();
  expect(resendCalls).toBe(1);
  verified = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend verification email' })).toHaveCount(0);
});

test('resend rate limit shows localized error without retry', async ({
  authenticatedPage: page,
}) => {
  let resendCalls = 0;
  await page.route('**/v1/users/me', jsonRoute(unverified));
  await page.route('**/v1/auth/resend-verification', (route) => {
    resendCalls++;
    return jsonRoute(
      { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
      429,
    )(route);
  });
  await page.goto('/app/profile');
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByText('Too many requests. Please wait a moment.')).toBeVisible();
  expect(resendCalls).toBe(1);
});

test('resend reconciles an already verified account', async ({ authenticatedPage: page }) => {
  let verified = false;
  await page.route('**/v1/users/me', (route) =>
    jsonRoute({ ...unverified, email_verified: verified })(route),
  );
  await page.route('**/v1/auth/resend-verification', (route) => {
    verified = true;
    return jsonRoute({ message: 'Email is already verified' })(route);
  });
  await page.goto('/app/profile');
  await expect(page.getByText('Not verified')).toBeVisible();
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByText('Verification email sent to e2e@example.com')).toHaveCount(0);
});

test('verification in an authenticated tab refreshes the current profile', async ({
  authenticatedPage: page,
}) => {
  let verified = false;
  let profileCalls = 0;
  await page.route('**/v1/users/me', (route) => {
    profileCalls++;
    return jsonRoute({ ...unverified, email_verified: verified })(route);
  });
  await page.route('**/v1/auth/verify-email', (route) => {
    verified = true;
    return jsonRoute({ message: 'Email verified successfully' })(route);
  });
  await page.goto('/app/profile');
  await expect(page.getByText('Not verified')).toBeVisible();
  const beforeVerification = profileCalls;
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/verify-email?token=opaque&source=mail';
    link.textContent = 'Open verification';
    document.body.appendChild(link);
  });
  await page.getByRole('link', { name: 'Open verification' }).click();
  await expect(page).toHaveURL(/\/verify-email\?source=mail$/);
  await expect(page.getByText('Email verified successfully!')).toBeVisible();
  expect(profileCalls).toBeGreaterThan(beforeVerification);
});
