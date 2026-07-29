import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test.describe('production PWA shell', () => {
  // Offline navigation and Cache Storage inspection are verified against Chromium's
  // production service-worker implementation. Installed-PWA behavior on iOS remains
  // part of the physical-device validation checklist, not WebKit emulation.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Service-worker cache and offline-routing assertions require Chromium.',
  );

  test('declares an installable manifest, activates its worker, and keeps private media out of Cache Storage', async ({
    page,
    context,
  }) => {
    await page.goto('/');

    const manifest = await page.evaluate(async () => {
      const response = await fetch('/manifest.webmanifest');
      return response.json();
    });
    expect(manifest).toMatchObject({
      display: 'standalone',
      scope: '/',
      start_url: '/',
      icons: expect.arrayContaining([
        expect.objectContaining({ src: '/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/icon-512.png', sizes: '512x512' }),
      ]),
    });

    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      return registration?.active?.state === 'activated';
    });
    // A newly installed worker does not control the page that registered it. Reload once
    // while online so the offline navigation below is handled by the active worker.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    const cacheUrls = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const requests = await Promise.all(
        cacheNames.map(async (cacheName) => (await caches.open(cacheName)).keys()),
      );
      return requests.flat().map((request) => request.url);
    });
    expect(cacheUrls).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\/v1\/(content|media)\//)]),
    );

    await context.setOffline(true);
    try {
      await page.goto('/offline', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toBeEmpty();
    } finally {
      await context.setOffline(false);
    }
  });
});
