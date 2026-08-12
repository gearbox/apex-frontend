import { test, expect } from '@playwright/test';

// This auth-isolation flow uses page.route() for every API transition. Keep
// service workers blocked (the global default): a controlling WebKit worker can
// bypass those mocks, turning a deterministic A → logout → B scenario into a
// request to an unavailable backend. Push-detachment behavior is covered by
// the push/auth unit suites; this spec verifies the user-visible cache boundary.
test.use({ serviceWorkers: 'block' });

const expiresAt = () => new Date(Date.now() + 900_000).toISOString();
const cookieExpiresAt = () => new Date(Date.now() + 86_400_000).toISOString();

const account = (id: string, email: string) => ({
  id,
  email,
  display_name: id === 'user-a' ? 'Account A' : 'Account B',
  subscription_tier: 'free',
  role: 'user',
  email_verified: true,
  age_verified: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
});

const token = (id: string) => ({
  access_token: `access-${id}`,
  refresh_token: `refresh-${id}`,
  token_type: 'bearer',
  expires_in: 900,
  expires_at: expiresAt(),
  content_cookie_expires_at: cookieExpiresAt(),
});

function libraryPage(id: string) {
  const isA = id === 'user-a';
  return {
    items: [
      {
        asset_ref: `output:${id}-asset`,
        source: 'output',
        media: {
          media_type: 'image',
          original: {
            url: `/v1/content/outputs/${id}-asset`,
            width: 512,
            height: 512,
            content_type: 'image/jpeg',
            size_bytes: 1024,
          },
          variants: [],
        },
        created_at: '2025-01-01T00:00:00Z',
        expires_at: null,
        display_title: isA ? 'A private library item' : 'B private library item',
        original_filename: null,
        is_favorite: false,
        duration_ms: null,
        job_id: `job-${id}`,
        output_count: 1,
        model: 'grok-imagine-image',
        generation_type: 't2i',
        available_actions: ['download'],
        tags: [],
      },
    ],
    limit: 20,
    has_more: false,
    next_cursor: null,
  };
}

test('A logout then B login in the same tab does not retain A library state @cross-browser', async ({
  page,
}) => {
  await page.route('**/v1/auth/login', async (route) => {
    const body = (await route.request().postDataJSON()) as { email: string };
    const id = body.email.startsWith('b@') ? 'user-b' : 'user-a';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(token(id)),
    });
  });
  await page.route('**/v1/auth/refresh', async (route) => {
    const body = (await route.request().postDataJSON()) as { refresh_token: string };
    const id = body.refresh_token.includes('user-b') ? 'user-b' : 'user-a';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(token(id)),
    });
  });
  await page.route('**/v1/users/me', async (route) => {
    const id = route.request().headers().authorization?.includes('user-b') ? 'user-b' : 'user-a';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(account(id, `${id}@example.com`)),
    });
  });
  await page.route('**/v1/events/sse-ticket', (route) => route.fulfill({ status: 503 }));
  await page.route('**/v1/billing/balance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balance: 0 }),
    }),
  );
  await page.route('**/v1/users/me/stats', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_jobs: 0,
        completed_jobs: 0,
        failed_jobs: 0,
        total_outputs: 0,
        total_uploads: 0,
        storage_used_bytes: 0,
      }),
    }),
  );
  await page.route('**/v1/auth/logout', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'ok' }),
    }),
  );
  await page.route('**/v1/library*', async (route) => {
    const id = route.request().headers().authorization?.includes('user-b') ? 'user-b' : 'user-a';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(libraryPage(id)),
    });
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('a@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/app\/create/);

  await page.goto('/app/library');
  await expect(page.getByRole('button', { name: 'A private library item' })).toHaveCount(1);

  await page.goto('/app/profile');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Email').fill('b@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/app\/create/);
  await page.goto('/app/library');

  // Mobile browsers can take an extra render turn to mount the grid after the auth-bound cache
  // reset. Keep the assertion bound to B's specific card rather than racing that transition.
  await expect(page.getByRole('button', { name: 'B private library item' })).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'A private library item' })).toHaveCount(0, {
    timeout: 15_000,
  });
});
