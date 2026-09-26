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

  test('FC20: legal header clears landscape notch insets', async ({ page }) => {
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

  test('FC21: auth controls clear portrait status and home-indicator insets', async ({ page }) => {
    await mockCurrentLegal(page);
    await page.goto('/login');
    await emulateSafeArea(page);
    const languageSelector = assertBoundingBox(
      await page.getByRole('button', { name: 'Language' }).boundingBox(),
    );
    expect(languageSelector.y).toBeGreaterThanOrEqual(47);

    await page.goto('/register');
    await emulateSafeArea(page);
    const footer = assertBoundingBox(await page.locator('.legal-footer').boundingBox());
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(footer.y + footer.height).toBeLessThanOrEqual(viewportHeight - 34);
  });
});
