import { test, expect } from '@playwright/test';
import { jsonRoute } from '../helpers/api';

test('password recovery journey @cross-browser', async ({ page }) => {
  let resetBody: unknown;
  let logoutCalls = 0;
  const logs: string[] = [];
  page.on('console', (message) => logs.push(message.text()));
  await page.route(
    '**/v1/auth/forgot-password',
    jsonRoute({ message: 'Password reset email sent' }),
  );
  await page.route('**/v1/auth/logout', (route) => {
    logoutCalls++;
    return route.fulfill({ status: 200, body: '{}' });
  });
  await page.route('**/v1/auth/reset-password', async (route) => {
    resetBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"message":"ok"}' });
  });

  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill('person@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your inbox')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('apex-refresh-token', 'old-session'));

  await page.goto('/reset-password?token=e2e&source=mail');
  await expect(page).toHaveURL(/\/reset-password\?source=mail$/);
  expect(await page.evaluate(() => localStorage.getItem('apex-refresh-token'))).toBe('old-session');
  await page.getByLabel('New Password', { exact: true }).fill('newpassword123');
  await page.getByLabel('Confirm New Password').fill('newpassword123');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(
    page.getByText('Your password has been updated. Sign in with your new password.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(resetBody).toEqual({ token: 'e2e', new_password: 'newpassword123' });
  expect(logoutCalls).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('apex-refresh-token'))).toBeNull();
  expect(logs.join('\n')).not.toContain('token=e2e');
});

test('reset validation, missing link, and invalid token', async ({ page }) => {
  let requests = 0;
  await page.route('**/v1/auth/reset-password', (route) => {
    requests++;
    return jsonRoute({ error: 'invalid_token', message: 'expired', status_code: 400 }, 400)(route);
  });
  await page.goto('/reset-password');
  await expect(page.getByText('This reset link is invalid or has expired.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
    'href',
    '/forgot-password',
  );
  expect(requests).toBe(0);

  await page.goto('/reset-password?token=opaque');
  await expect(page).toHaveURL(/\/reset-password$/);
  const submit = page.getByRole('button', { name: 'Update password' });
  await page.getByLabel('New Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm New Password').fill('short');
  await expect(submit).toBeDisabled();
  await page.getByLabel('New Password', { exact: true }).fill('a'.repeat(129));
  await page.getByLabel('Confirm New Password').fill('a'.repeat(129));
  await expect(page.getByText('Password must be no more than 128 characters.')).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.getByLabel('New Password', { exact: true }).fill('validpassword');
  await expect(submit).toBeDisabled();
  await page.getByLabel('Confirm New Password').fill('validpassword');
  await submit.click();
  await expect(page.getByText('This reset link is invalid or has expired.')).toBeVisible();
  expect(requests).toBe(1);
});

test('login reset banner consumes stale security reason and preserves unrelated query', async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('apex-auth-failure-reason', 'token_reuse_detected'),
  );
  await page.goto('/login?reset=done&source=mail');
  await expect(
    page.getByText('Your password has been updated. Sign in with your new password.'),
  ).toBeVisible();
  await expect(page.getByText('Security notice')).toHaveCount(0);
  await expect(page).toHaveURL(/\/login\?source=mail$/);
});

test('reset handles an upstream rate limit', async ({ page }) => {
  await page.route(
    '**/v1/auth/reset-password',
    jsonRoute({ error: 'rate_limit_exceeded', message: 'Wait', status_code: 429 }, 429),
  );
  await page.goto('/reset-password?token=opaque');
  await page.getByLabel('New Password', { exact: true }).fill('validpassword');
  await page.getByLabel('Confirm New Password').fill('validpassword');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Too many requests. Please wait a moment.')).toBeVisible();
});

test('verification strips token and works while logged out', async ({ page }) => {
  const logs: string[] = [];
  let profileCalls = 0;
  page.on('console', (message) => logs.push(message.text()));
  await page.route(
    '**/v1/auth/verify-email',
    jsonRoute({ message: 'Email verified successfully' }),
  );
  await page.route('**/v1/users/me', (route) => {
    profileCalls++;
    return jsonRoute({})(route);
  });
  await page.goto('/verify-email?token=opaque&source=mail');
  await expect(page).toHaveURL(/\/verify-email\?source=mail$/);
  await expect(page.getByText('Email verified successfully!')).toBeVisible();
  expect(profileCalls).toBe(0);
  expect(logs.join('\n')).not.toContain('opaque');
});
