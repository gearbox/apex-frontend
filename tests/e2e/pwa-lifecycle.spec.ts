import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.describe('PWA update lifecycle fixture', () => {
  test('a dirty page keeps B waiting, ignores legacy activation, then updates once on confirmation', async ({
    page,
  }) => {
    await page.goto('/pwa-lifecycle-fixture/index.html?build=a');
    await expect(page.locator('#build')).toHaveText('fixture-a');
    await page.getByLabel('Keep unsaved draft').check();
    await page.getByRole('button', { name: 'Deploy build B' }).click();
    await expect(page.locator('#status')).toHaveText('build-b-waiting');

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/pwa-lifecycle-fixture/');
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    await page.waitForTimeout(300);
    await expect(page.locator('#status')).toHaveText('build-b-waiting');

    await page.getByRole('button', { name: 'Update anyway' }).click();
    await expect(page.locator('#build')).toHaveText('fixture-b');
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('fixture-reload-count')))
      .toBe('1');
  });

  test('a clean page activates the matching waiting worker automatically', async ({ page }) => {
    await page.goto('/pwa-lifecycle-fixture/index.html?build=a');
    await expect(page.locator('#build')).toHaveText('fixture-a');
    await page.getByRole('button', { name: 'Deploy build B' }).click();
    await expect(page.locator('#build')).toHaveText('fixture-b');
  });
});

test('production output keeps version and worker lifecycle resources revalidatable', () => {
  const headers = readFileSync('build/_headers', 'utf8');
  const worker = readFileSync('build/service-worker.js', 'utf8');
  const version = JSON.parse(readFileSync('build/app-version.json', 'utf8')) as {
    buildSha?: string;
  };

  expect(version.buildSha).toBeTruthy();
  expect(headers).toContain(
    '/app-version.json\n  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
  );
  expect(headers).toContain(
    '/service-worker.js\n  Cache-Control: no-store, no-cache, must-revalidate, max-age=0',
  );
  expect(headers).toContain('/*\n  Cache-Control: no-cache, must-revalidate');
  expect(headers).toContain(
    '/_app/immutable/*\n  Cache-Control: public, max-age=31536000, immutable',
  );
  expect(worker).toContain('APEX_ACTIVATE_UPDATE');
  expect(worker).toContain('APEX_GET_BUILD_INFO');
  expect(worker).not.toContain('SKIP_WAITING');
  expect(worker).not.toContain('app-version.json');
  expect(worker).not.toContain('pwa-lifecycle-fixture');
});
