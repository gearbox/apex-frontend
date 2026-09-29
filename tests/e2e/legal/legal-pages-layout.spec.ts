import { expect, test, type Page } from '@playwright/test';
import { emulateSafeArea } from '../fixtures/safeArea';

const documentTypes = [
  ['terms', '/terms'],
  ['privacy', '/privacy'],
  ['sensitive_data_consent', '/consent'],
] as const;

const legalDocuments = documentTypes.map(([doc_type]) => ({
  doc_type,
  version: '2026-01-01',
  sha256: 'a'.repeat(64),
  requires_reacceptance: true,
}));

function longDocument(docType: string) {
  const paragraphs = Array.from(
    { length: 180 },
    (_, index) => `Paragraph ${index + 1}: This legal document remains intentionally readable.`,
  ).join('\n\n');

  return {
    doc_type: docType,
    version: '2026-01-01',
    sha256: 'a'.repeat(64),
    requires_reacceptance: true,
    content_md: `# ${docType}\n\n${paragraphs}\n\n## Final section\n\nEnd of document.`,
  };
}

async function mockLegalDocument(page: Page) {
  await page.route(/\/v1\/legal\/documents\/[a-z_]+/, (route) => {
    const docType = new URL(route.request().url()).pathname.split('/').pop() ?? 'privacy';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(longDocument(docType)),
    });
  });
}

async function mockCurrentLegal(page: Page) {
  await page.route('**/v1/legal/current', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: legalDocuments }),
    }),
  );
}

async function mockGoogleProduct(page: Page) {
  await page.route('**/v1/auth/product-info', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        product: 'vex',
        display_name: 'Vex.pics',
        age_gate: 'none',
        allowed_auth_methods: ['email_password', 'google_oauth'],
        content_rating: 'permissive',
        payment_providers: [],
      }),
    }),
  );
}

async function mockOAuthSignupInfo(page: Page) {
  await page.route('**/v1/auth/oauth/signup-info', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'oauth@example.com', provider: 'google' }),
    }),
  );
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function assertBoundingBox(box: BoundingBox | null): BoundingBox {
  if (!box) throw new Error('Expected element to have a bounding box');
  return box;
}

function boxesIntersect(first: BoundingBox, second: BoundingBox): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

async function expandConsentStatement(page: Page, path: '/register' | '/auth/signup') {
  await page.goto(path);
  await emulateSafeArea(page);
  await page.getByText('Read the consent statement', { exact: true }).click();
  await expect(page.locator('.consent-disclosure .legal-prose')).toBeVisible();
}

async function assertFooterDoesNotCoverContent(page: Page) {
  const authShell = page.locator('.auth-page-shell');
  await authShell.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
  });

  const footerOwnsBottomPoint = await page.evaluate(() => {
    const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 40);
    return Boolean(element?.closest('.legal-footer'));
  });
  expect(footerOwnsBottomPoint).toBe(false);

  await authShell.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const submit = assertBoundingBox(
    await page.getByRole('button', { name: 'Create account', exact: true }).boundingBox(),
  );
  const footer = assertBoundingBox(await page.locator('.legal-footer').boundingBox());
  expect(footer.y).toBeGreaterThanOrEqual(submit.y + submit.height);
}

type AuthContentLocator = (page: Page) => ReturnType<Page['locator']>;

interface ShortViewport {
  name: string;
  width: number;
  height: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
}

const shortViewports: ShortViewport[] = [
  {
    name: 'iPhone SE',
    width: 320,
    height: 568,
    safeArea: { top: 20, right: 0, bottom: 0, left: 0 },
  },
  {
    name: 'iPhone 8',
    width: 375,
    height: 667,
    safeArea: { top: 20, right: 0, bottom: 0, left: 0 },
  },
  {
    name: 'Notched portrait',
    width: 390,
    height: 664,
    safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
  },
  {
    name: 'Landscape phone',
    width: 844,
    height: 390,
    safeArea: { top: 0, right: 47, bottom: 21, left: 47 },
  },
];

interface AuthPageCase {
  name: string;
  path: '/login' | '/forgot-password' | '/register' | '/auth/signup';
  primaryButton: string;
  expandConsent?: boolean;
  firstContent: AuthContentLocator;
}

const shortAuthPages: AuthPageCase[] = [
  {
    name: 'login',
    path: '/login',
    primaryButton: 'Sign in',
    firstContent: (page) => page.getByRole('button', { name: 'Continue with Google' }),
  },
  {
    name: 'forgot password',
    path: '/forgot-password',
    primaryButton: 'Send reset link',
    firstContent: (page) => page.getByRole('heading', { name: 'Vex.pics' }),
  },
  {
    name: 'register (collapsed consent)',
    path: '/register',
    primaryButton: 'Create account',
    firstContent: (page) => page.getByRole('button', { name: 'Continue with Google' }),
  },
  {
    name: 'register (expanded consent)',
    path: '/register',
    primaryButton: 'Create account',
    expandConsent: true,
    firstContent: (page) => page.getByRole('button', { name: 'Continue with Google' }),
  },
  {
    name: 'OAuth signup (expanded consent)',
    path: '/auth/signup',
    primaryButton: 'Create account',
    expandConsent: true,
    firstContent: (page) => page.getByRole('heading', { name: 'Vex.pics' }),
  },
];

async function assertShortAuthLayout(
  page: Page,
  pageCase: AuthPageCase,
  viewport: ShortViewport,
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(pageCase.path);
  await emulateSafeArea(page, viewport.safeArea);

  const primaryButton = page.getByRole('button', { name: pageCase.primaryButton, exact: true });
  await expect(primaryButton).toBeVisible();
  if (pageCase.expandConsent) {
    await page.getByText('Read the consent statement', { exact: true }).click();
    await expect(page.locator('.consent-disclosure .legal-prose')).toBeVisible();
  }

  const languageSelector = page.getByRole('button', { name: 'Language' });
  const firstContent = pageCase.firstContent(page);
  await expect(languageSelector).toBeVisible();
  await expect(firstContent).toBeVisible();
  expect(
    boxesIntersect(
      assertBoundingBox(await languageSelector.boundingBox()),
      assertBoundingBox(await firstContent.boundingBox()),
    ),
  ).toBe(false);

  const authShell = page.locator('.auth-page-shell');
  const dimensions = await authShell.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  if (dimensions.scrollHeight > dimensions.clientHeight) {
    await authShell.evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
    });
    const footerOwnsBottomPoint = await page.evaluate(() => {
      const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 24);
      return Boolean(element?.closest('.legal-footer'));
    });
    expect(footerOwnsBottomPoint).toBe(false);
  }

  await authShell.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const footer = assertBoundingBox(await page.locator('.legal-footer').boundingBox());
  const primary = assertBoundingBox(await primaryButton.boundingBox());
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(footer.y).toBeGreaterThanOrEqual(primary.y + primary.height + 16);
  expect(footer.y + footer.height).toBeLessThanOrEqual(viewportHeight - viewport.safeArea.bottom);

  if (dimensions.scrollHeight <= dimensions.clientHeight) {
    expect(boxesIntersect(footer, primary)).toBe(false);
  }
}

test.describe('legal-page layout @cross-browser', () => {
  test('FC18: legal documents scroll through their final section', async ({ page }) => {
    await mockLegalDocument(page);

    for (const [, path] of documentTypes) {
      await page.goto(path);
      const legalScroll = page.getByTestId('legal-scroll');
      await expect(page.getByRole('heading', { name: 'Final section' })).toBeVisible();

      const dimensions = await legalScroll.evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
      expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

      await legalScroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(page.getByRole('heading', { name: 'Final section' })).toBeInViewport();
    }
  });

  test('FC19: legal header clears a portrait status bar and opens the language selector', async ({
    page,
  }) => {
    await mockLegalDocument(page);
    await page.goto('/privacy');
    await emulateSafeArea(page);

    const languageSelector = page.getByRole('button', { name: 'Language' });
    const backLink = page.getByRole('link', { name: 'Back to the app' });
    expect(assertBoundingBox(await languageSelector.boundingBox()).y).toBeGreaterThanOrEqual(47);
    expect(assertBoundingBox(await backLink.boundingBox()).y).toBeGreaterThanOrEqual(47);

    await languageSelector.click();
    await expect(page.getByRole('listbox', { name: 'Select language' })).toBeVisible();
  });

  test('S2-d (FC20): legal header clears landscape notch insets', async ({ page }) => {
    await mockLegalDocument(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/privacy');
    await emulateSafeArea(page, { top: 0, right: 47, bottom: 21, left: 47 });

    const backLink = assertBoundingBox(
      await page.getByRole('link', { name: 'Back to the app' }).boundingBox(),
    );
    const languageSelector = assertBoundingBox(
      await page.getByRole('button', { name: 'Language' }).boundingBox(),
    );
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(backLink.x).toBeGreaterThanOrEqual(47);
    expect(languageSelector.x + languageSelector.width).toBeLessThanOrEqual(viewportWidth - 47);
  });

  test('S2-a (FC21): auth footer stays above the home indicator on short and long pages', async ({
    page,
  }) => {
    await mockCurrentLegal(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await emulateSafeArea(page);
    const languageSelector = assertBoundingBox(
      await page.getByRole('button', { name: 'Language' }).boundingBox(),
    );
    expect(languageSelector.y).toBeGreaterThanOrEqual(47);
    const loginFooter = assertBoundingBox(await page.locator('.legal-footer').boundingBox());
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(loginFooter.y + loginFooter.height).toBeLessThanOrEqual(viewportHeight - 34);

    await page.goto('/register');
    await emulateSafeArea(page);
    await page.locator('.auth-page-shell').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const footer = assertBoundingBox(await page.locator('.legal-footer').boundingBox());
    expect(footer.y + footer.height).toBeLessThanOrEqual(viewportHeight - 34);
  });

  test('S2-b: expanded consent text is never covered by the footer on register or OAuth signup', async ({
    page,
  }) => {
    await mockCurrentLegal(page);
    await mockLegalDocument(page);
    await mockGoogleProduct(page);
    await mockOAuthSignupInfo(page);
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'apex:oauth:pending-signup',
        JSON.stringify({ ticket: 's2-ticket', returnTo: null, savedAt: Date.now() }),
      );
    });
    await page.setViewportSize({ width: 390, height: 844 });

    await expandConsentStatement(page, '/register');
    await assertFooterDoesNotCoverContent(page);

    await expandConsentStatement(page, '/auth/signup');
    await assertFooterDoesNotCoverContent(page);
  });

  test('S2-c: the language selector does not overlap the first auth content element', async ({
    page,
  }) => {
    await mockCurrentLegal(page);
    await mockGoogleProduct(page);
    await mockOAuthSignupInfo(page);
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'apex:oauth:pending-signup',
        JSON.stringify({ ticket: 's2-selector-ticket', returnTo: null, savedAt: Date.now() }),
      );
    });
    await page.setViewportSize({ width: 390, height: 844 });

    const cases = [
      {
        path: '/register',
        firstContent: page.getByRole('button', { name: 'Continue with Google' }),
      },
      { path: '/login', firstContent: page.getByRole('button', { name: 'Continue with Google' }) },
      { path: '/auth/signup', firstContent: page.getByRole('heading', { name: 'Vex.pics' }) },
    ] as const;

    for (const { path, firstContent } of cases) {
      await page.goto(path);
      await emulateSafeArea(page);
      await expect(firstContent).toBeVisible();
      const languageSelector = assertBoundingBox(
        await page.getByRole('button', { name: 'Language' }).boundingBox(),
      );
      const firstContentBox = assertBoundingBox(await firstContent.boundingBox());

      expect(boxesIntersect(languageSelector, firstContentBox)).toBe(false);
    }
  });

  test('T2-a: all auth form containers remain horizontally centered on a desktop viewport', async ({
    page,
  }) => {
    await mockCurrentLegal(page);
    await mockLegalDocument(page);
    await mockGoogleProduct(page);
    await mockOAuthSignupInfo(page);
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'apex:oauth:pending-signup',
        JSON.stringify({ ticket: 't2-centering-ticket', returnTo: null, savedAt: Date.now() }),
      );
    });
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const path of [
      '/login',
      '/register',
      '/forgot-password',
      '/verify-email?token=x',
      '/auth/signup',
    ]) {
      await test.step(path, async () => {
        await page.goto(path);
        const formContainer = page.locator('.auth-main > *');
        await expect(formContainer).toBeVisible();
        const box = assertBoundingBox(await formContainer.boundingBox());
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        expect(Math.abs(box.x + box.width / 2 - viewportWidth / 2)).toBeLessThanOrEqual(2);
      });
    }
  });

  test('T3-a: short auth pages keep the in-flow footer below content across safe areas', async ({
    page,
  }) => {
    await mockCurrentLegal(page);
    await mockLegalDocument(page);
    await mockGoogleProduct(page);
    await mockOAuthSignupInfo(page);
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'apex:oauth:pending-signup',
        JSON.stringify({ ticket: 't3-short-screen-ticket', returnTo: null, savedAt: Date.now() }),
      );
    });

    for (const viewport of shortViewports) {
      for (const pageCase of shortAuthPages) {
        await assertShortAuthLayout(page, pageCase, viewport);
      }
    }
  });
});
