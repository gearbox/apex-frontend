import { expect, test, type Page } from '@playwright/test';
import { jsonRoute } from '../helpers/api';

const token = {
  access_token: 'oauth-access-token',
  refresh_token: 'oauth-refresh-token',
  token_type: 'bearer',
  expires_in: 900,
  expires_at: new Date(Date.now() + 900_000).toISOString(),
  content_cookie_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
};

const user = {
  id: 'oauth-user',
  email: 'oauth@example.com',
  display_name: 'OAuth User',
  subscription_tier: 'free',
  email_verified: true,
  has_password: false,
  role: 'user',
  age_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const legalDocuments = [
  { doc_type: 'terms', version: '2026-10-01', sha256: 'a'.repeat(64) },
  { doc_type: 'privacy', version: '2026-10-01', sha256: 'b'.repeat(64) },
  {
    doc_type: 'sensitive_data_consent',
    version: '2026-10-01',
    sha256: 'c'.repeat(64),
  },
];

const CALLBACK_REQUEST_HREFS = '__oauth_callback_request_hrefs__';

async function recordRequestHrefs(page: Page): Promise<void> {
  await page.addInitScript((storageKey) => {
    const record = () => {
      const state = JSON.parse(window.name || '{}') as Record<string, unknown>;
      const recorded = Array.isArray(state[storageKey]) ? (state[storageKey] as string[]) : [];
      recorded.push(location.href);
      state[storageKey] = recorded;
      window.name = JSON.stringify(state);
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      record();
      return originalFetch(...args);
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      record();
      return originalOpen.call(
        this,
        method,
        url,
        async ?? true,
        username ?? null,
        password ?? null,
      );
    };
  }, CALLBACK_REQUEST_HREFS);
}

async function expectRequestHrefsWithoutFragments(page: Page): Promise<void> {
  const hrefs = await page.evaluate((storageKey) => {
    const state = JSON.parse(window.name || '{}') as Record<string, unknown>;
    return Array.isArray(state[storageKey]) ? (state[storageKey] as string[]) : [];
  }, CALLBACK_REQUEST_HREFS);
  expect(hrefs).not.toHaveLength(0);
  expect(hrefs.every((href) => !href.includes('#'))).toBe(true);
}

/**
 * WebKit cannot fulfill an intercepted request with an HTTP redirect. Returning a tiny document
 * keeps the full-page OAuth navigation realistic while making the fake provider work in every
 * Playwright browser.
 */
function redirectDocument(destination: string): string {
  const serializedDestination = JSON.stringify(destination).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><script>location.replace(${serializedDestination})</script>`;
}

async function mockFreshAuth(page: Page) {
  await page.route('**/v1/auth/oauth/exchange', jsonRoute(token));
  await page.route('**/v1/auth/oauth/complete-signup', jsonRoute(token, 201));
  await page.route('**/v1/auth/refresh', jsonRoute(token));
  await page.route('**/v1/users/me', jsonRoute(user));
}

test.describe('Google OAuth @cross-browser', () => {
  test('S1-b: login Back skips the callback transit page after the fake authorize flow', async ({
    page,
  }) => {
    await recordRequestHrefs(page);
    await mockFreshAuth(page);
    let exchangeCalls = 0;
    const exchangeRequestHrefs: string[] = [];
    await page.route('**/v1/auth/oauth/exchange', (route) => {
      exchangeCalls += 1;
      exchangeRequestHrefs.push(page.url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(token),
      });
    });
    await page.route(
      '**/v1/auth/product-info',
      jsonRoute({
        product: 'vex',
        display_name: 'Vex.pics',
        age_gate: 'none',
        allowed_auth_methods: ['google_oauth'],
        content_rating: 'permissive',
        payment_providers: [],
      }),
    );
    await page.route('**/v1/auth/oauth/google/authorize*', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: redirectDocument(
          'http://localhost:4173/auth/callback#result=login&code=c1&return_to=%2Fapp%2Flibrary',
        ),
      }),
    );

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Google' }).click();

    await expect(page).toHaveURL(/\/app\/library$/);
    expect(page.url()).not.toContain('#');
    expect(exchangeCalls).toBe(1);
    expect(exchangeRequestHrefs).toHaveLength(1);
    expect(exchangeRequestHrefs[0]).not.toContain('#');
    await expectRequestHrefsWithoutFragments(page);

    await page.goBack();
    expect(new URL(page.url()).pathname).not.toBe('/auth/callback');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // R0-e: client-init cleanup preserves SvelteKit's history entry metadata.
    await expect
      .poll(() => page.evaluate(() => history.state))
      .toMatchObject({
        'sveltekit:history': expect.any(Number),
        'sveltekit:navigation': expect.any(Number),
        'sveltekit:states': expect.any(Object),
      });
  });

  test('S1-c: signup Back leaves the signup page without re-entering the callback loop', async ({
    page,
  }) => {
    await mockFreshAuth(page);
    await page.route(
      '**/v1/auth/product-info',
      jsonRoute({
        product: 'vex',
        display_name: 'Vex.pics',
        age_gate: 'none',
        allowed_auth_methods: ['google_oauth'],
        content_rating: 'permissive',
        payment_providers: [],
      }),
    );
    await page.route(
      '**/v1/auth/oauth/signup-info',
      jsonRoute({ email: 'oauth@example.com', provider: 'google' }),
    );
    await page.route('**/v1/legal/current', jsonRoute({ documents: legalDocuments }));
    await page.route('**/v1/legal/documents/*', (route) => {
      const doc = legalDocuments.find((item) => route.request().url().includes(item.doc_type));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...doc, content_md: '# Document' }),
      });
    });
    await page.route('**/v1/auth/oauth/google/authorize*', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: redirectDocument(
          'http://localhost:4173/auth/callback#result=signup&ticket=s1-ticket',
        ),
      }),
    );

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/\/auth\/signup$/);

    await page.goBack();
    expect(new URL(page.url()).pathname).not.toBe('/auth/signup');
    expect(new URL(page.url()).pathname).not.toBe('/auth/callback');
    await page.waitForTimeout(1_000);
    expect(new URL(page.url()).pathname).not.toBe('/auth/signup');
    expect(new URL(page.url()).pathname).not.toBe('/auth/callback');
  });

  test('completes OAuth signup and clears the tab handoff', async ({ page }) => {
    await recordRequestHrefs(page);
    await mockFreshAuth(page);
    const signupInfoRequestHrefs: string[] = [];
    const exactDocumentResponses = legalDocuments.map(({ doc_type }) =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/v1/legal/documents/${doc_type}` &&
          response.status() === 200,
      ),
    );
    await page.route('**/v1/auth/oauth/signup-info', (route) => {
      signupInfoRequestHrefs.push(page.url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'oauth@example.com', provider: 'google' }),
      });
    });
    await page.route('**/v1/legal/current', jsonRoute({ documents: legalDocuments }));
    await page.route('**/v1/legal/documents/*', (route) => {
      const doc = legalDocuments.find((item) => route.request().url().includes(item.doc_type));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...doc, content_md: '# Document' }),
      });
    });

    await page.goto('/auth/callback#result=signup&ticket=t1');
    await expect(page.getByText('oauth@example.com')).toBeVisible();
    await Promise.all(exactDocumentResponses);
    await expect(page.getByText('Loading the versions you need to review…')).toHaveCount(0);
    const legalCheckboxes = page.getByRole('checkbox');
    await expect(legalCheckboxes).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) await legalCheckboxes.nth(index).check();

    const createAccount = page.getByRole('button', { name: /create account/i });
    await expect(createAccount).toBeEnabled({ timeout: 15_000 });
    await createAccount.click();

    await expect(page).toHaveURL(/\/app\/create$/);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('apex:oauth:pending-signup')))
      .toBeNull();
    expect(signupInfoRequestHrefs).toHaveLength(1);
    expect(signupInfoRequestHrefs[0]).not.toContain('#');
    await expectRequestHrefsWithoutFragments(page);
  });

  test('shows a callback error and restarts through authorize', async ({ page }) => {
    let authorizeCalls = 0;
    await page.route('**/v1/auth/oauth/google/authorize*', (route) => {
      authorizeCalls += 1;
      return route.fulfill({
        contentType: 'text/html',
        body: redirectDocument('http://localhost:4173/login'),
      });
    });
    await page.goto('/auth/callback#result=error&error=flow_expired');
    await expect(page.getByText(/sign-in session expired/i)).toBeVisible();

    const tryAgain = page.getByRole('button', { name: 'Try again' });
    await expect(tryAgain).toBeEnabled();
    await tryAgain.click();
    // WebKit does not always surface a request event for an intercepted full-page navigation,
    // while the route handler observes the navigation in every browser.
    await expect.poll(() => authorizeCalls).toBe(1);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('T1-e: retries a provider error with the destination saved when sign-in began', async ({
    page,
  }) => {
    await page.route(
      '**/v1/auth/product-info',
      jsonRoute({
        product: 'vex',
        display_name: 'Vex.pics',
        age_gate: 'none',
        allowed_auth_methods: ['google_oauth'],
        content_rating: 'permissive',
        payment_providers: [],
      }),
    );

    const returnTargets: Array<string | null> = [];
    await page.route('**/v1/auth/oauth/google/authorize*', (route) => {
      returnTargets.push(new URL(route.request().url()).searchParams.get('return_to'));
      const destination =
        returnTargets.length === 1
          ? 'http://localhost:4173/auth/callback#result=error&error=flow_expired'
          : 'http://localhost:4173/login';
      return route.fulfill({ contentType: 'text/html', body: redirectDocument(destination) });
    });

    await page.goto('/login?redirect=/app/library');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByText(/sign-in session expired/i)).toBeVisible();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => returnTargets).toEqual(['/app/library', '/app/library']);
  });
});
