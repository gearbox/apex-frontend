import { test, expect } from '../fixtures/auth.fixture';

const adminProfile = {
  id: 'usr_e2e_001',
  email: 'admin@example.com',
  display_name: 'E2E Admin',
  role: 'admin',
  subscription_tier: 'free',
  email_verified: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const page1Response = {
  items: [
    {
      id: 'usr_001',
      email: 'alice@example.com',
      display_name: 'Alice',
      role: 'user',
      subscription_tier: 'free',
      is_active: true,
      email_verified_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'usr_002',
      email: 'bob@example.com',
      display_name: 'Bob',
      role: 'user',
      subscription_tier: 'free',
      is_active: true,
      email_verified_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ],
  has_more: true,
  next_cursor: 'cursor-2',
  limit: 20,
};

const page2Response = {
  items: [
    {
      id: 'usr_003',
      email: 'carol@example.com',
      display_name: 'Carol',
      role: 'user',
      subscription_tier: 'free',
      is_active: true,
      email_verified_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ],
  has_more: false,
  next_cursor: null,
  limit: 20,
};

const filteredResponse = {
  items: [
    {
      id: 'usr_001',
      email: 'alice@example.com',
      display_name: 'Alice',
      role: 'user',
      subscription_tier: 'free',
      is_active: true,
      email_verified_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ],
  has_more: false,
  next_cursor: null,
  limit: 20,
};

test.describe('Admin Users cursor pagination', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminProfile),
      }),
    );
  });

  test('page 1 shows first batch — Prev disabled, Next enabled', async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/v1/admin/users**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(page1Response),
      }),
    );

    await page.goto('/app/admin');
    await page.getByRole('tab', { name: 'Users' }).click();

    await expect(page.getByRole('button', { name: /previous page/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /next page/i })).toBeEnabled();
    await expect(page.getByText('Page 1')).toBeVisible();
  });

  test('clicking Next advances to page 2 — Prev enabled, Next disabled', async ({
    authenticatedPage: page,
  }) => {
    let requestCount = 0;
    const requestUrls: string[] = [];
    await page.route('**/v1/admin/users**', (route) => {
      const url = new URL(route.request().url());
      requestUrls.push(url.toString());
      const cursor = url.searchParams.get('cursor');
      requestCount++;
      const body = cursor === 'cursor-2' ? page2Response : page1Response;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.goto('/app/admin');
    await page.getByRole('tab', { name: 'Users' }).click();

    await page.getByRole('button', { name: /next page/i }).click();

    await expect(page.getByText('Page 2')).toBeVisible();
    await expect(page.getByRole('button', { name: /previous page/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /next page/i })).toBeDisabled();

    // carol is on page 2
    await expect(
      page
        .locator('td.email-cell:visible, span.card-email:visible')
        .filter({ hasText: /carol@example\.com/ }),
    ).toBeVisible();
    expect(requestUrls.some((u) => u.includes('cursor=cursor-2'))).toBe(true);
    expect(requestCount).toBeGreaterThanOrEqual(2);
  });

  test('clicking Prev from page 2 returns to page 1', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/admin/users**', (route) => {
      const url = new URL(route.request().url());
      const cursor = url.searchParams.get('cursor');
      const body = cursor === 'cursor-2' ? page2Response : page1Response;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.goto('/app/admin');
    await page.getByRole('tab', { name: 'Users' }).click();

    await page.getByRole('button', { name: /next page/i }).click();
    await expect(page.getByText('Page 2')).toBeVisible();

    // staleTime=30s means TanStack Query may serve page 1 from cache without a network
    // request. Capture the first request if it fires; if not (cache hit), null signals
    // "no cursor was sent" — both are correct behaviour.
    const prevRequestPromise = page
      .waitForRequest((req) => req.url().includes('/v1/admin/users'), { timeout: 3000 })
      .catch(() => null);

    await page.getByRole('button', { name: /previous page/i }).click();
    const prevRequest = await prevRequestPromise;

    await expect(page.getByText('Page 1')).toBeVisible();
    await expect(page.getByRole('button', { name: /previous page/i })).toBeDisabled();
    // Returning to page 1 must drop the cursor entirely
    if (prevRequest) {
      expect(new URL(prevRequest.url()).searchParams.get('cursor')).toBeNull();
    }
  });

  test('changing a filter resets to Page 1 with no cursor', async ({ authenticatedPage: page }) => {
    const requestUrls: string[] = [];
    await page.route('**/v1/admin/users**', (route) => {
      const url = new URL(route.request().url());
      requestUrls.push(url.toString());
      const cursor = url.searchParams.get('cursor');
      const role = url.searchParams.get('role');
      const body = role ? filteredResponse : cursor === 'cursor-2' ? page2Response : page1Response;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/app/admin');
    await page.getByRole('tab', { name: 'Users' }).click();

    // Actually go to page 2 via the UI
    await page.getByRole('button', { name: /next page/i }).click();
    await expect(page.getByText('Page 2')).toBeVisible();
    expect(requestUrls.some((u) => u.includes('cursor=cursor-2'))).toBe(true);

    // Change the role filter → must reset to page 1 with no cursor
    await page.locator('select.filter-select').first().selectOption('user');

    await expect(page.getByText('Page 1')).toBeVisible();
    await expect(page.getByRole('button', { name: /previous page/i })).toBeDisabled();

    const lastUrl = new URL(requestUrls[requestUrls.length - 1]);
    expect(lastUrl.searchParams.has('cursor')).toBe(false);
    expect(lastUrl.searchParams.get('role')).toBe('user');
  });
});
