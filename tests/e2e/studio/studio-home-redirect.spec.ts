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

test('cold start refreshes the session once', async ({ authenticatedPage: page }) => {
  await stubStudio(page);
  const requests = { refresh: 0, me: 0 };
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/v1/auth/refresh') requests.refresh++;
    if (path === '/v1/users/me') requests.me++;
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/app\/studio$/);
  await expect.poll(() => requests).toEqual({ refresh: 1, me: 1 });
});
