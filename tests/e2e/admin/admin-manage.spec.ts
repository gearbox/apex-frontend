import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const mockAdmins = [
  {
    id: 'usr_sa_001',
    email: 'superadmin@example.com',
    display_name: 'Super Admin',
    role: 'superadmin',
    permissions: [],
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'usr_a_001',
    email: 'admin@example.com',
    display_name: 'Regular Admin',
    role: 'admin',
    permissions: ['billing_adjust'],
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];

const mockAuditLog = [
  {
    id: 'audit_001',
    actor_id: 'usr_sa_001',
    target_user_id: 'usr_a_001',
    action: 'role.grant',
    detail: "Role changed from 'user' to 'admin'",
    source: 'api',
    created_at: '2025-06-01T12:00:00Z',
  },
];

const superadminProfile = {
  id: 'usr_sa_001',
  email: 'superadmin@example.com',
  display_name: 'Super Admin',
  role: 'superadmin',
  subscription_tier: 'free',
  email_verified: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const adminProfile = {
  id: 'usr_e2e_001',
  email: 'e2e@example.com',
  display_name: 'E2E User',
  role: 'admin',
  subscription_tier: 'free',
  email_verified: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

test.describe('Admin Management Tab', () => {
  test('is not visible to regular admins', async ({ authenticatedPage: page }) => {
    // Override profile to admin (not superadmin)
    await page.route('**/v1/users/me', jsonRoute(adminProfile));
    await page.route('**/v1/admin/manage/admins', jsonRoute(mockAdmins));
    await page.route('**/v1/admin/manage/audit', jsonRoute(mockAuditLog));

    await page.goto('/app/admin');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: 'Admins' })).not.toBeVisible();
  });

  test('is visible to superadmins', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me', jsonRoute(superadminProfile));
    await page.route('**/v1/admin/manage/admins', jsonRoute(mockAdmins));
    await page.route('**/v1/admin/manage/audit', jsonRoute(mockAuditLog));

    await page.goto('/app/admin');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: 'Admins' })).toBeVisible({ timeout: 5000 });
  });

  test('shows admin list with role badges', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me', jsonRoute(superadminProfile));
    await page.route('**/v1/admin/manage/admins', jsonRoute(mockAdmins));
    await page.route('**/v1/admin/manage/audit', jsonRoute(mockAuditLog));

    await page.goto('/app/admin');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'Admins' }).click();

    // Use :visible + exact regex to avoid substring matches (e.g. "admin" matching "superadmin")
    // and to avoid strict-mode violations from multiple rows in the list
    await expect(
      page.locator('td.email-cell:visible, span.card-email:visible').filter({ hasText: /^superadmin@example\.com$/ })
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('td.email-cell:visible, span.card-email:visible').filter({ hasText: /^admin@example\.com$/ })
    ).toBeVisible();
  });

  test('can open grant role modal', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me', jsonRoute(superadminProfile));
    await page.route('**/v1/admin/manage/admins', jsonRoute(mockAdmins));
    await page.route('**/v1/admin/manage/audit', jsonRoute(mockAuditLog));
    await page.route('**/v1/admin/users**', jsonRoute({ items: [], has_more: false, limit: 0 }));

    await page.goto('/app/admin');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'Admins' }).click();
    await page.getByRole('button', { name: /add admin/i }).click();

    await expect(page.getByRole('dialog', { name: /grant admin role/i })).toBeVisible({ timeout: 3000 });
  });
});
