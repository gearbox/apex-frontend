import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

// These assertions rely on page.route() for the library API. WebKit lets a
// controlling worker bypass those handlers, so isolate this non-PWA suite.
test.use({ serviceWorkers: 'block' });

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

async function dragSheetHandle(sheet: Locator, distance: number) {
  const handle = sheet.getByTestId('mobile-nav-sheet-drag-zone');
  await expect(handle).toBeVisible();
  const pointer = {
    button: 0,
    clientX: 100,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'touch',
  };
  await handle.dispatchEvent('pointerdown', { ...pointer, clientY: 100 });
  await handle.dispatchEvent('pointermove', { ...pointer, clientY: 100 + distance });
  await handle.dispatchEvent('pointerup', { ...pointer, clientY: 100 + distance });
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

      const bottomTabs = page.locator('.btm-tabs');
      await expect(bottomTabs.locator('.btm-tab-label')).toHaveText([
        'Create',
        'Sessions',
        'Library',
        'More',
      ]);
      await expect(page.getByRole('link', { name: 'Sessions' })).toHaveAttribute(
        'href',
        '/app/sessions',
      );
      await expect(page.getByRole('link', { name: 'Library' })).toHaveAttribute(
        'href',
        '/app/library',
      );
      await expect(page.getByRole('button', { name: 'Projects' })).toHaveAttribute(
        'aria-controls',
        'mobile-projects-sheet',
      );
      await expect(page.getByRole('button', { name: 'Projects' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );

      await page.getByRole('link', { name: 'Sessions' }).click();
      await expect(page).toHaveURL(/\/app\/sessions/);
      await expect(page.getByRole('link', { name: 'Sessions' })).toHaveClass(/active/);

      await page.goto('/app/create');
      await page.getByRole('link', { name: 'Library' }).click();
      await expect(page).toHaveURL(/\/app\/library$/);

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
      await expect(page.getByTestId('mobile-library-slot')).toHaveClass(/active/);
      await expect(page.getByTestId('mobile-library-projects-action')).toHaveClass(
        /project-active/,
      );
      await expect
        .poll(() =>
          libraryRequests.some((url) => url.searchParams.get('project_id') === 'project-8'),
        )
        .toBe(true);
    },
  );

  test(
    'mobile Projects and More sheets share handle-only swipe-down dismissal',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await mockLibraryProjectNavigation(page);
      await page.goto('/app/create');

      const projectsSheet = page.locator('#mobile-projects-sheet');
      await page.getByRole('button', { name: 'Projects' }).click();
      await dragSheetHandle(projectsSheet, 220);
      await expect(projectsSheet).toHaveCount(0);

      await page.getByRole('button', { name: 'Projects' }).click();
      await dragSheetHandle(projectsSheet, 20);
      await expect(projectsSheet).toBeVisible();

      const projectList = projectsSheet.locator('.mobile-project-list');
      await expect(projectList).toBeVisible();
      const listBox = await projectList.boundingBox();
      if (!listBox) throw new Error('Mobile project list is not measurable');
      await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + 20);
      await page.mouse.down();
      await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + 80, { steps: 3 });
      await page.mouse.up();
      await expect(projectsSheet).toBeVisible();

      await page.locator('[role="presentation"]').click({ position: { x: 4, y: 4 } });
      await page.getByRole('button', { name: 'More' }).click();
      const moreSheet = page.locator('#mobile-more-sheet');
      await expect(moreSheet).toBeVisible();
      await expect(moreSheet.getByRole('link', { name: 'Sessions' })).toHaveCount(0);
      await dragSheetHandle(moreSheet, 220);
      await expect(moreSheet).toHaveCount(0);
    },
  );
});
