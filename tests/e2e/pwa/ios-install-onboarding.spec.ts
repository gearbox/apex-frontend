import { expect, test } from '../fixtures/auth.fixture';
import { emulateStandaloneMode } from '../fixtures/standalone';
import { jsonRoute } from '../helpers/api';

const DISMISSED_KEY = 'apex-pwa-install-dismissed';

test.use({ serviceWorkers: 'allow' });

async function prepareCleanIosBrowser(page: Parameters<typeof emulateStandaloneMode>[0]) {
  await page.addInitScript((key) => localStorage.removeItem(key), DISMISSED_KEY);
  await page.route('**/v1/providers', jsonRoute({ providers: [], user_context: null }));
  await page.route('**/v1/billing/pricing', jsonRoute([]));
}

test.describe('iOS install onboarding @mobile-webkit', () => {
  test.skip(
    ({ browserName }) => browserName !== 'webkit',
    'iOS install guidance is exercised by the mobile Safari project.',
  );

  test('shows iOS guidance from clean storage and persists dismissal', async ({
    authenticatedPage: page,
  }) => {
    await prepareCleanIosBrowser(page);
    await page.goto('/app/create');

    const dialog = page.getByRole('dialog', { name: 'Install app' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('To install this app on your iPhone or iPad:');

    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), DISMISSED_KEY))
      .toBe('true');

    await page.reload();
    await expect(dialog).toBeHidden();
  });

  test('does not show browser-install guidance in standalone emulation', async ({
    authenticatedPage: page,
  }) => {
    await prepareCleanIosBrowser(page);
    await emulateStandaloneMode(page);
    await page.goto('/app/create');

    await expect
      .poll(() =>
        page.evaluate(() => ({
          displayMode: window.matchMedia('(display-mode: standalone)').matches,
          navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
        })),
      )
      .toEqual({ displayMode: true, navigatorStandalone: true });
    await expect(page.getByRole('dialog', { name: 'Install app' })).toBeHidden();
  });
});
