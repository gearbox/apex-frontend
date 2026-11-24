import { test, expect } from '../fixtures/auth.fixture';
import { stubStudio } from './studio-fixture';
for (const available of [true, false])
  test(
    `home uses ${available ? 'Studio' : 'Create'} when Studio is ${available ? 'available' : 'disabled'}`,
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      await stubStudio(page, available);
      await page.goto('/');
      await expect(page).toHaveURL(available ? /\/app\/studio$/ : /\/app\/create$/);
    },
  );
