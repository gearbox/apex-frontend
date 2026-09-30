import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

test.describe('In-product feedback', () => {
  test('submits a trimmed, pathname-only report from the global entry point', async ({
    authenticatedPage: page,
  }) => {
    let submitted: Record<string, unknown> | undefined;
    await page.route('**/v1/feedback', async (route) => {
      submitted = (await route.request().postDataJSON()) as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '55555555-5555-4555-8555-555555555555',
          status: 'open',
          created_at: '2026-09-29T12:00:00Z',
        }),
      });
    });

    await page.goto('/app/create?handoff=private#fragment');
    await page.getByRole('button', { name: 'Report a problem' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report a problem' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('What happened?').fill('  The generated image is blank.  ');
    await dialog.getByRole('button', { name: 'Send report' }).click();

    await expect(dialog.getByText('Thanks — we got your report.')).toBeVisible();
    expect(submitted).toMatchObject({
      category: 'bug',
      message: 'The generated image is blank.',
      client_path: '/app/create',
    });
    expect(submitted).not.toHaveProperty('User-Agent');
    expect(submitted).not.toHaveProperty('user_agent');
    expect(submitted?.app_version).toMatch(/\+/);
  });

  test('allows an admin to save a note and transition a feedback report', async ({
    authenticatedPage: page,
  }) => {
    const adminProfile = {
      id: 'admin_e2e_001',
      email: 'admin@example.com',
      display_name: 'Admin',
      role: 'admin',
      subscription_tier: 'free',
      email_verified: true,
      has_password: true,
      age_verified: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const report = {
      id: '11111111-1111-4111-8111-111111111111',
      category: 'generation',
      status: 'open',
      message: 'The selected model returned a blank image.',
      user_id: '22222222-2222-4222-8222-222222222222',
      user_email: 'reporter@example.com',
      job_id: null,
      asset_ref: null,
      asset_url: null,
      client_path: '/app/create',
      app_version: '0.27.1+testsha',
      user_agent: 'Playwright',
      admin_note: null,
      resolved_at: null,
      resolved_by: null,
      created_at: '2026-09-29T12:00:00Z',
      updated_at: '2026-09-29T12:00:00Z',
    };
    let current: Record<string, unknown> = { ...report };
    await page.route('**/v1/users/me', jsonRoute(adminProfile));
    await page.route(
      '**/v1/admin/feedback*',
      jsonRoute({ items: [current], limit: 30, has_more: false, next_cursor: null }),
    );
    await page.route('**/v1/admin/feedback/**', async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(current),
        });
      const body = route.request().postDataJSON() as {
        status?: string;
        admin_note?: string | null;
      };
      current = { ...current, ...body, updated_at: '2026-09-29T12:05:00Z' };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
    });

    await page.goto('/app/admin');
    await page.getByRole('tab', { name: 'Feedback' }).click();
    await page.getByRole('button', { name: 'View' }).click();
    const dialog = page.getByRole('dialog', { name: 'Feedback report' });
    await dialog.getByLabel('Admin note').fill('Reproduced in staging.');
    await dialog.getByRole('button', { name: 'Save note' }).click();
    await dialog.getByRole('button', { name: 'Mark in progress' }).click();
    await expect(dialog.getByText('In progress')).toBeVisible();
  });
});
