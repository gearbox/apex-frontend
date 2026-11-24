import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';
import { stubStudio } from './studio-fixture';

test(
  'mobile workspace has no bottom tabs and Back returns to Studio',
  { tag: '@mobile' },
  async ({ authenticatedPage: page }) => {
    await stubStudio(page);
    await page.goto('/app/studio/new');
    await page.getByLabel('Project name').fill('Mobile release');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(/\/app\/studio\/p1$/);
    await expect(page.locator('.btm-tabs')).toHaveCount(0);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    await page.getByRole('link', { name: 'Back to Studio' }).click();
    await expect(page).toHaveURL(/\/app\/studio$/);
  },
);
