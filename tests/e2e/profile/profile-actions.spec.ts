import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const mockStats = {
  total_jobs: 42,
  completed_jobs: 38,
  failed_jobs: 4,
  total_outputs: 76,
  total_uploads: 12,
  storage_used_bytes: 157_286_400,
};

test.describe('Profile actions', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me/stats', jsonRoute(mockStats));
  });

  test('1. Change Password — happy path', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me/password', jsonRoute({ message: 'Password changed successfully' }, 201));

    await page.goto('/app/profile');

    await page.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByLabel('Current Password').fill('current-pass');
    await page.getByLabel('New Password', { exact: true }).fill('newpassword123');
    await page.getByLabel('Confirm New Password').fill('newpassword123');

    await page.getByRole('button', { name: 'Update Password' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
    // Toast should appear
    await expect(page.getByText('Password changed successfully')).toBeVisible({ timeout: 5000 });
  });

  test('2. Change Password — validation prevents submit with mismatched passwords', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/profile');

    await page.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByLabel('Current Password').fill('current-pass');
    await page.getByLabel('New Password', { exact: true }).fill('newpassword123');
    await page.getByLabel('Confirm New Password').fill('different-password');

    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Password' })).toBeDisabled();
  });

  test('3. Change Password — too short message visible', async ({ authenticatedPage: page }) => {
    await page.goto('/app/profile');

    await page.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByLabel('New Password', { exact: true }).fill('short');

    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Password' })).toBeDisabled();
  });

  test('4. Change Password — server error displayed in modal', async ({
    authenticatedPage: page,
  }) => {
    await page.route(
      '**/v1/users/me/password',
      jsonRoute(
        { error: 'invalid_password', message: 'Current password is incorrect', status_code: 400 },
        400,
      ),
    );

    await page.goto('/app/profile');

    await page.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByLabel('Current Password').fill('wrong-pass');
    await page.getByLabel('New Password', { exact: true }).fill('newpassword123');
    await page.getByLabel('Confirm New Password').fill('newpassword123');

    await page.getByRole('button', { name: 'Update Password' }).click();

    await expect(page.getByText('Current password is incorrect')).toBeVisible({ timeout: 5000 });
  });

  test('5. Sign out all devices — redirects to /login', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me/logout-all', jsonRoute({ message: 'All sessions revoked' }, 201));

    await page.goto('/app/profile');

    await page.getByRole('button', { name: 'Sign out all devices' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Sign out everywhere' }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });

  test('6. Delete Account — happy path redirects to /login', async ({
    authenticatedPage: page,
  }) => {
    // Use fallback() for non-DELETE so the fixture's GET handler still works
    await page.route('**/v1/users/me', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Account deactivated',
            deactivated_at: new Date().toISOString(),
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/app/profile');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Delete Account' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Delete button should be disabled initially
    await expect(page.getByRole('button', { name: 'Delete my account' })).toBeDisabled();

    // Type the confirmation word
    await page.getByLabel(/Type DELETE to confirm/i).fill('DELETE');

    await expect(page.getByRole('button', { name: 'Delete my account' })).toBeEnabled();

    await page.getByRole('button', { name: 'Delete my account' }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });

  test('7. Delete Account — wrong confirmation word keeps button disabled', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/profile');

    await page.getByRole('button', { name: 'Delete Account' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    const confirmInput = page.getByLabel(/Type DELETE to confirm/i);
    const deleteBtn = page.getByRole('button', { name: 'Delete my account' });

    // Lowercase should not enable button
    await confirmInput.fill('delete');
    await expect(deleteBtn).toBeDisabled();

    // Different word should not enable button
    await confirmInput.fill('REMOVE');
    await expect(deleteBtn).toBeDisabled();
  });

  test('8. User Stats section is visible with correct values', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/profile');

    await expect(page.getByText('Usage')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('42')).toBeVisible();
    await expect(page.getByText('Total Jobs')).toBeVisible();
  });
});
