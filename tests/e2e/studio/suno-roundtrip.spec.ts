import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';
import { stubStudio } from './studio-fixture';

async function expectNoSeriousAxeViolations(page: import('@playwright/test').Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
  ).toEqual([]);
}

async function createTrack(page: import('@playwright/test').Page) {
  await page.goto('/app/studio/new');
  await page.getByLabel('Project name').fill('Suno roundtrip');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/app\/studio\/p1$/);
  const input = page.getByPlaceholder('New track').filter({ visible: true });
  await input.fill('Song');
  await input.press('Enter');
  const link = page.getByRole('link', { name: /Song/ }).filter({ visible: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/app\/studio\/p1\/tracks\/t1$/);
}

test(
  'imports Suno text, exports the same boxes and keeps both versions current',
  { tag: '@cross-browser' },
  async ({ authenticatedPage: page, browserName }) => {
    await stubStudio(page, true, true);
    await createTrack(page);
    await page.getByRole('link', { name: 'Import from Suno' }).first().click();
    await expect(page.getByRole('heading', { name: 'Import from Suno' })).toBeVisible();
    await expectNoSeriousAxeViolations(page);

    await page.getByLabel('Style of Music').fill('dream pop');
    await page.getByLabel('Lyrics').fill('[Verse]\nA line of lyrics');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Plan: new version')).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/studio\/p1\/tracks\/t1$/);
    await expect(page.getByText('A line of lyrics')).toBeVisible();
    await expect(
      page
        .locator('section[aria-labelledby^="document-plan-heading-"]')
        .getByRole('heading', { name: 'Verse' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export to Suno' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Style of Music' })).toHaveValue('dream pop');
    await expect(dialog.locator('[data-export-field="lyrics"]')).toHaveText(
      '[Verse]\nA line of lyrics',
    );
    await expectNoSeriousAxeViolations(page);

    if (browserName === 'chromium') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await dialog.getByRole('button', { name: 'Copy Lyrics' }).click();
      await expect(dialog.getByRole('status')).toContainText('Copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        '[Verse]\nA line of lyrics',
      );
    }
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('link', { name: 'History' }).click();
    await expect(page).toHaveURL(/\/app\/studio\/p1\/tracks\/t1\/history$/);
    await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
    await expect(page.getByText('Current')).toHaveCount(2);
    await expectNoSeriousAxeViolations(page);
  },
);
