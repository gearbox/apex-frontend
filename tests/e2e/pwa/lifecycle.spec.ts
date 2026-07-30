import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ serviceWorkers: 'allow' });

test.describe('PWA update lifecycle fixture', () => {
  test('a dirty page keeps B waiting, ignores legacy activation, then updates once on confirmation', async ({
    page,
  }) => {
    await page.goto('/pwa-lifecycle-fixture/index.html?build=a');
    await expect(page.locator('#build')).toHaveText('fixture-a');
    await page.getByLabel('Keep unsaved draft').check();
    await page.getByRole('button', { name: 'Deploy build B' }).click();
    await expect(page.locator('#status')).toHaveText('build-b-waiting');

    let reloads = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) reloads += 1;
    });

    const legacyAcknowledgement = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/pwa-lifecycle-fixture/');
      if (!registration?.waiting) throw new Error('Expected build B to be waiting');
      const waitingWorker = registration.waiting;

      const channel = new MessageChannel();
      return new Promise<{ type?: string; buildSha?: string }>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          channel.port1.close();
          reject(new Error('Timed out waiting for the legacy activation acknowledgement'));
        }, 2_000);
        channel.port1.onmessage = (event) => {
          window.clearTimeout(timeout);
          channel.port1.close();
          resolve(event.data ?? {});
        };
        channel.port1.start();
        waitingWorker.postMessage({ type: 'SKIP_WAITING' }, [channel.port2]);
      });
    });
    expect(legacyAcknowledgement).toEqual({
      type: 'FIXTURE_LEGACY_ACTIVATION_IGNORED',
      buildSha: 'fixture-b',
    });

    const workerState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/pwa-lifecycle-fixture/');
      return {
        waitingScript: registration?.waiting?.scriptURL,
        controllerScript: navigator.serviceWorker.controller?.scriptURL,
      };
    });
    expect(workerState.waitingScript).toContain('/pwa-lifecycle-fixture/sw-b.js');
    expect(workerState.controllerScript).toContain('/pwa-lifecycle-fixture/sw-a.js');
    await expect(page.locator('#status')).toHaveText('build-b-waiting');
    expect(await page.evaluate(() => sessionStorage.getItem('fixture-reload-count'))).toBeNull();
    expect(reloads).toBe(0);

    await page.getByRole('button', { name: 'Update anyway' }).click();
    await expect(page.locator('#build')).toHaveText('fixture-b');
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('fixture-reload-count')))
      .toBe('1');
    expect(reloads).toBe(1);
  });

  test('a clean page activates the matching waiting worker automatically', async ({ page }) => {
    await page.goto('/pwa-lifecycle-fixture/index.html?build=a');
    await expect(page.locator('#build')).toHaveText('fixture-a');
    await page.getByRole('button', { name: 'Deploy build B' }).click();
    await expect(page.locator('#build')).toHaveText('fixture-b');
  });
});

test('production output keeps lifecycle resources revalidatable and the precache public', ({
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Production build-output assertions run once in the Chromium project.',
  );
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
  expect(worker).not.toContain('server/');
  expect(worker).not.toContain('pwa-lifecycle-fixture');
  expect(worker).not.toContain('/v1/content/');
});
