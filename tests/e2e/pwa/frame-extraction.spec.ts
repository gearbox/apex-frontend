import { test, expect } from '../fixtures/auth.fixture';
import { emulateStandaloneMode } from '../fixtures/standalone';
import { setupFrameExtraction } from '../helpers/frame-extraction';

// Route mocks are deterministic with SW blocked; this checks standalone layout, not device installation.
test('frame modal fits the standalone viewport and restores the viewer @mobile', async ({
  authenticatedPage: page,
}) => {
  await emulateStandaloneMode(page);
  const { dialog } = await setupFrameExtraction(page, false, true);
  await expect(dialog.getByText("Frame extraction isn't available for this video")).toBeVisible();
  const bounds = await dialog.evaluate((element) => {
    const panel = element.firstElementChild!.getBoundingClientRect();
    const close = element.querySelector('header button')!.getBoundingClientRect();
    const scroll = element.querySelector('[data-frame-modal-scroll]')!;
    return {
      height: panel.height,
      viewport: window.innerHeight,
      closeTop: close.top,
      closeBottom: close.bottom,
      overscroll: getComputedStyle(scroll).overscrollBehaviorY,
    };
  });
  expect(bounds.height).toBeCloseTo(bounds.viewport, 0);
  expect(bounds.closeTop).toBeGreaterThanOrEqual(0);
  expect(bounds.closeBottom).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.overscroll).toBe('contain');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  const viewer = page.getByRole('dialog', { name: 'Asset details' });
  await expect(viewer).toHaveJSProperty('inert', false);
  await expect(viewer.getByRole('button', { name: 'Extract frames' })).toBeFocused();
});
