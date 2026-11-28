import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';
import type { Page } from '@playwright/test';
import { stubStudio } from './studio-fixture';

async function expectNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
  ).toEqual([]);
}

async function createTrack(page: Page) {
  await page.goto('/app/studio/new');
  await page.getByLabel('Project name').fill('Song editor');
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

async function openEditor(page: Page, template: 'Blank' | 'Verse–Chorus' = 'Verse–Chorus') {
  await page.getByRole('link', { name: 'Write the song' }).click();
  await expect(page).toHaveURL(/\/tracks\/t1\/edit$/);
  await page.getByRole('button', { name: template, exact: true }).click();
  await expect(page.getByLabel('Song title')).toHaveValue('Song');
  await page.getByLabel('Lyrics language').fill('en');
}

test(
  'creates and saves a Verse–Chorus song with line delivery, restores drafts, and keeps plan/export order aligned',
  { tag: '@cross-browser' },
  async ({ authenticatedPage: page }) => {
    await stubStudio(page, true, true);
    await createTrack(page);
    await openEditor(page);

    const firstSection = page.locator('article[id^="section-"]').first();
    await firstSection.getByLabel('Lyrics').fill('[whispered]\nA line');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved: plan v1, lyrics v1')).toBeVisible();
    await expect(page).toHaveURL(/\/tracks\/t1\/edit$/);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/tracks\/t1$/);
    await expect(page.getByText('A line')).toBeVisible();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const exportDialog = page.getByRole('dialog', { name: 'Export to Suno' });
    await expect(exportDialog.locator('[data-export-field="lyrics"]')).toContainText(
      '[whispered]\nA line',
    );
    await exportDialog.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('link', { name: 'Edit' }).click();
    const bridge = page.locator('article[id^="section-"]').filter({
      has: page.locator('select[aria-label="Section kind"] option:checked', { hasText: 'Bridge' }),
    });
    await expect(bridge).toHaveCount(1);
    const bridgeHandle = bridge.getByRole('button', { name: 'Move Bridge' });
    await bridgeHandle.focus();
    await bridgeHandle.press('Alt+ArrowUp');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved: plan v2')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    const planSection = page.locator('section[aria-labelledby^="document-plan-heading-"]');
    const viewOrder = await planSection.locator('h3').allTextContents();
    const normalizedViewOrder = viewOrder.map((name) =>
      name.replace(/\s+\d+$/u, '').toLocaleLowerCase(),
    );
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const exportField = page
      .getByRole('dialog', { name: 'Export to Suno' })
      .locator('[data-export-field="lyrics"]');
    const exportOrder = async () => {
      const exportedLyrics = await exportField.innerText();
      return [...exportedLyrics.matchAll(/^\[([^\]]+)\]$/gmu)]
        .map((match) => match[1]!.replace(/\s+\d+$/u, '').toLocaleLowerCase())
        .filter((name) => normalizedViewOrder.includes(name));
    };
    await expect.poll(exportOrder).toEqual(normalizedViewOrder);

    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('link', { name: 'Edit' }).click();
    const bridgeCard = page.locator('article[id^="section-"]').filter({
      has: page.locator('select[aria-label="Section kind"] option:checked', { hasText: 'Bridge' }),
    });
    await bridgeCard.getByLabel('Lyrics').fill('Saved on this device');
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByText(/Restore unsaved changes from/)).toBeVisible();
    // The choice comes first: nothing under it can be typed into.
    await expect(page.locator('[inert] #song-title')).toHaveCount(1);
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('[inert]')).toHaveCount(0);
    await expect(bridgeCard.getByLabel('Lyrics')).toHaveValue('Saved on this device');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved: lyrics v2')).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  },
);

test(
  'desktop save bar is in view after a Verse–Chorus start',
  { tag: '@cross-browser' },
  async ({ authenticatedPage: page }) => {
    await stubStudio(page, true, true);
    await createTrack(page);
    await openEditor(page);
    await expect(page.locator('article[id^="section-"]')).toHaveCount(6);
    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    // Measured where it is: neither this check nor `boundingBox` scrolls the button into view.
    const expectWithinViewport = async () => {
      const box = await saveButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    };
    await expectWithinViewport();
    // It stays there at the far end of the song too.
    await page.locator('.workspace-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expectWithinViewport();
  },
);

test(
  'mobile save bar stays in view and Close returns to the track page',
  { tag: '@mobile' },
  async ({ authenticatedPage: page }) => {
    await stubStudio(page, true, true);
    await createTrack(page);
    await openEditor(page, 'Blank');
    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveButton).toBeVisible();
    const bar = saveButton.locator('..');
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await expectNoSeriousAxeViolations(page);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/app\/studio\/p1\/tracks\/t1$/);
  },
);
