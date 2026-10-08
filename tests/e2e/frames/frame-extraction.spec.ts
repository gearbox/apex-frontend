import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';
import {
  setupFrameExtraction as setup,
  canvasSample,
  SOURCE_ID,
  DURATION_MS,
} from '../helpers/frame-extraction';

test.describe('local frame extraction', () => {
  test(
    'native ranged previews, manual scrubbing, sequential lineage uploads and Use as input',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page, browserName }) => {
      test.skip(
        browserName === 'webkit',
        'Playwright WebKit cannot reliably exercise the media/canvas path; physical iOS staging validation is required.',
      );
      const f = await setup(page);
      await expect(f.dialog.getByRole('button', { name: /^Automatic:/ })).toHaveCount(6);
      const add = f.dialog.getByRole('button', { name: 'Add frame' });
      await expect(add).toBeEnabled();
      expect(f.mediaRequests.some((request) => request.range)).toBe(true);
      expect(
        f.mediaRequests.every(
          (request) =>
            request.url.includes('/v1/content/') &&
            !request.authorization &&
            request.resource !== 'fetch',
        ),
      ).toBe(true);
      expect(await f.dialog.locator('video').getAttribute('crossorigin')).toBe('use-credentials');
      const initial = await canvasSample(f.dialog.locator('canvas'));
      expect(initial.width / initial.height).toBeCloseTo(9 / 16, 3);
      const slider = f.dialog.getByRole('slider');
      await slider.evaluate((element) => {
        const input = element as HTMLInputElement;
        input.value = '1250';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await expect(add).toBeEnabled();
      await expect
        .poll(async () => (await canvasSample(f.dialog.locator('canvas'))).pixel[1])
        .toBeGreaterThan(initial.pixel[1]);
      await add.click();
      const manual = f.dialog.getByRole('button', { name: /^Manually chosen frames:/ });
      await expect(manual).toHaveCount(1);
      await f.dialog.getByRole('button', { name: 'Automatic: 00:00.000' }).click();
      const scroll = f.dialog.locator('[data-frame-modal-scroll]');
      await scroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.scrollTop = 0;
      });
      await expect(manual).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('dialog', { name: 'Asset details', includeHidden: true }),
      ).toHaveJSProperty('inert', true);
      await f.dialog.getByRole('button', { name: 'Extract frames' }).click();
      await expect(f.dialog.getByRole('button', { name: 'Use as input' })).toHaveCount(2);
      expect(f.uploads).toHaveLength(2);
      expect(
        f.uploads.every(
          (upload) =>
            upload.source === `upload:${SOURCE_ID}` &&
            /^\d+$/.test(upload.timestamp) &&
            Number(upload.timestamp) <= DURATION_MS,
        ),
      ).toBe(true);
      await f.dialog.getByRole('button', { name: 'Use as input' }).first().click();
      await expect(page).toHaveURL(/\/app\/create/);
    },
  );
  test(
    'reachable corrupt video shows unsupported state and reports the source',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      const f = await setup(page, true);
      await expect(f.dialog.getByText("This video can't be opened in this browser")).toBeVisible({
        timeout: 15000,
      });
      await f.dialog.getByRole('button', { name: 'Report this video' }).click();
      await expect(f.dialog).toBeHidden();
      const feedback = page.getByRole('dialog', { name: 'Report a problem' });
      await expect(feedback).toBeVisible();
      await expect(feedback.getByText('Linked result')).toBeVisible();
      await expect(feedback.getByRole('combobox')).toHaveValue('bug');
      let report: { asset_ref: string; category: string } | undefined;
      await page.route('**/v1/feedback', (route) => {
        report = route.request().postDataJSON();
        return jsonRoute(
          { id: 'report-1', created_at: '2026-10-06T00:00:00Z', status: 'new' },
          201,
        )(route);
      });
      await feedback
        .getByRole('textbox', { name: 'What happened?' })
        .fill('This video cannot be opened for frame extraction.');
      await feedback.getByRole('button', { name: 'Send report' }).click();
      await expect
        .poll(() => report)
        .toMatchObject({ asset_ref: `upload:${SOURCE_ID}`, category: 'bug' });
    },
  );
});
