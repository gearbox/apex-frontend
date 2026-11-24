import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';
import { stubStudio } from './studio-fixture';

test(
  'creates a project, reorders tracks and opens the current plan and lyrics',
  { tag: '@cross-browser' },
  async ({ authenticatedPage: page }) => {
    await stubStudio(page);
    await page.goto('/app/studio');
    await expect(page.getByText('Start a project. An album, an EP or a single.')).toBeVisible();
    const checkAxe = async () => {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
      ).toEqual([]);
    };
    await checkAxe();
    await page.getByRole('link', { name: 'New project' }).first().click();
    await checkAxe();
    await page.getByLabel('Project name').fill('A release');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(/\/app\/studio\/p1$/);
    await checkAxe();
    const input = page.getByPlaceholder('New track').filter({ visible: true });
    for (const title of ['First', 'Second', 'Third']) {
      await input.fill(title);
      await input.press('Enter');
      await expect(
        page.getByRole('link', { name: new RegExp(title) }).filter({ visible: true }),
      ).toBeVisible();
    }
    const third = page.getByRole('link', { name: /Third/ }).filter({ visible: true });
    await third.focus();
    await page.keyboard.press('Alt+ArrowUp');
    const rows = page
      .getByRole('list', { name: 'Tracks' })
      .filter({ visible: true })
      .getByRole('listitem');
    await expect(rows.nth(1)).toContainText('Third');
    await third.click();
    await expect(page.getByText('A line of lyrics')).toBeVisible();
    await expect(page.getByText('dream pop')).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
    ).toEqual([]);
  },
);
