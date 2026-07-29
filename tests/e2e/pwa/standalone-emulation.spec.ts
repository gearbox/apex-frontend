import { expect, test } from '@playwright/test';
import { emulateStandaloneMode } from '../fixtures/standalone';

test.use({ serviceWorkers: 'allow' });

test.describe('standalone-mode emulation', () => {
  test('exercises Apex standalone layout branches without claiming an installed-PWA test', async ({
    page,
  }) => {
    await emulateStandaloneMode(page);
    await page.goto('/');

    await expect
      .poll(() =>
        page.evaluate(() => ({
          displayMode: window.matchMedia('(display-mode: standalone)').matches,
          navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
          appHeight: document.documentElement.style.getPropertyValue('--app-height'),
        })),
      )
      .toEqual(expect.objectContaining({ displayMode: true, navigatorStandalone: true }));
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue('--app-height')),
      )
      .not.toBe('');
  });
});
