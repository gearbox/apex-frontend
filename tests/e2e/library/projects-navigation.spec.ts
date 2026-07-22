import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const projects = Array.from({ length: 8 }, (_, index) => ({
  id: `project-${index + 1}`,
  name: `Project ${index + 1}`,
  description: null,
  asset_count: index,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}));

async function mockLibraryProjectNavigation(page: Page) {
  const libraryRequests: URL[] = [];

  await page.route('**/v1/library**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/v1/library/projects') {
      return jsonRoute({ items: projects, limit: 50, has_more: false, next_cursor: null })(route);
    }
    if (url.pathname === '/v1/library/tags') {
      return jsonRoute({ items: [], limit: 50, has_more: false, next_cursor: null })(route);
    }
    if (url.pathname === '/v1/library') {
      libraryRequests.push(url);
      return jsonRoute({ items: [], limit: 30, has_more: false, next_cursor: null })(route);
    }
    return route.continue();
  });
  await page.route(
    '**/v1/storage/stats',
    jsonRoute({ upload_count: 0, total_mb: 0, quota_mb: null }),
  );

  return libraryRequests;
}

test.describe('Projects navigation', () => {
  test(
    'desktop nests the complete project list beneath Library and filters by URL',
    { tag: '@desktop' },
    async ({ authenticatedPage: page }) => {
      const libraryRequests = await mockLibraryProjectNavigation(page);

      await page.goto('/app/library?source=output');

      const projectSection = page.locator('.sidebar-nav > a[href="/app/library"] + section');
      await expect(projectSection).toBeVisible();
      await expect(projectSection.getByTestId('all-assets-project-action')).toBeVisible();
      await expect(
        projectSection.getByRole('button', { name: 'Project 8', exact: true }),
      ).toBeVisible();
      await expect(projectSection.getByTestId('desktop-project-scroll-region')).toHaveCSS(
        'overflow-y',
        'auto',
      );

      await projectSection.getByRole('button', { name: 'Project 8', exact: true }).click();
      await expect(page).toHaveURL(/\/app\/library\?source=output&project=project-8/);
      await expect
        .poll(() =>
          libraryRequests.some((url) => url.searchParams.get('project_id') === 'project-8'),
        )
        .toBe(true);
    },
  );

  test(
    'mobile Projects drawer is exclusive with More and selects a project',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      const libraryRequests = await mockLibraryProjectNavigation(page);

      await page.goto('/app/create');
      await page.getByRole('button', { name: 'Projects' }).click();

      const projectsSheet = page.locator('#mobile-projects-sheet');
      await expect(projectsSheet).toBeVisible();
      await expect(
        projectsSheet.getByRole('button', { name: 'Project 8', exact: true }),
      ).toBeVisible();
      await expect(projectsSheet.getByLabel('Rename project: Project 8')).toBeVisible();
      await expect(projectsSheet.getByLabel('Delete: Project 8')).toBeVisible();

      await page.locator('[role="presentation"]').click({ position: { x: 4, y: 4 } });
      await expect(projectsSheet).toHaveCount(0);
      await page.getByRole('button', { name: 'More' }).click();
      await expect(page.locator('#mobile-more-sheet')).toBeVisible();

      await page.locator('[role="presentation"]').click({ position: { x: 4, y: 4 } });
      await page.getByRole('button', { name: 'Projects' }).click();
      await projectsSheet.getByRole('button', { name: 'Project 8', exact: true }).click();

      await expect(projectsSheet).toHaveCount(0);
      await expect(page).toHaveURL(/\/app\/library\?project=project-8/);
      await expect
        .poll(() =>
          libraryRequests.some((url) => url.searchParams.get('project_id') === 'project-8'),
        )
        .toBe(true);
    },
  );
});
