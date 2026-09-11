import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';
import { GpuSessionScenario } from '../helpers/gpuSessionScenario';

/**
 * Phase 3 workstream 3 — mobile/PWA closure.
 *
 * Runs only under the mobile Chromium/WebKit projects (`pnpm test:e2e:mobile`), per this repo's
 * `@mobile` tag convention (see docs/ci-test-suite.md). Semantic bounding-box/CSS assertions are
 * used instead of screenshots, matching the existing mobile layout specs (e.g.
 * tests/e2e/library/projects-navigation.spec.ts).
 */

async function setupCommon(page: import('@playwright/test').Page) {
  await page.route((url) => url.pathname === '/v1/billing/pricing', jsonRoute([]));
}

/**
 * The Sessions page is an ordinarily tall, vertically-scrollable page — content further down is
 * expected to sit below the first screen's fold. Only horizontal containment is a layout bug here.
 */
async function boundsWithinHorizontalViewport(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
) {
  const [box, viewport] = await Promise.all([locator.boundingBox(), page.viewportSize()]);
  if (!box || !viewport) throw new Error('Element or viewport is not measurable');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  return box;
}

/** Dialogs are designed to fit entirely within the viewport (own internal scroll, safe-area padding). */
async function boundsFitViewport(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
) {
  const [box, viewport] = await Promise.all([locator.boundingBox(), page.viewportSize()]);
  if (!box || !viewport) throw new Error('Element or viewport is not measurable');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  return box;
}

test.describe('GPU sessions — mobile layout', () => {
  test(
    'Sessions page fits the mobile viewport with no horizontal overflow, and action rows wrap',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await setupCommon(page);
      const scenario = new GpuSessionScenario([
        { modelType: 'aisha-image', name: 'Aisha' },
        { modelType: 'aisha-image-lite', name: 'Aisha Lite' },
      ]);
      await scenario.install(page);
      scenario.startSession('aisha-image');
      scenario.completeBootstrap();
      scenario.attachModel('aisha-image-lite');

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 8000 });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      const actionsRow = page.locator('.card-actions').first();
      await expect(actionsRow).toHaveCSS('flex-wrap', 'wrap');
      await boundsWithinHorizontalViewport(page, actionsRow);
    },
  );

  test(
    'Deployment rows remain readable at mobile width',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await setupCommon(page);
      const scenario = new GpuSessionScenario([
        { modelType: 'aisha-image', name: 'Aisha' },
        { modelType: 'aisha-image-lite', name: 'Aisha Lite' },
      ]);
      await scenario.install(page);
      scenario.startSession('aisha-image');
      scenario.completeBootstrap();
      scenario.attachModel('aisha-image-lite');

      await page.goto('/app/sessions');
      const rows = page.getByLabel('Deployed models').locator('article');
      await expect(rows).toHaveCount(2, { timeout: 8000 });
      for (const row of await rows.all()) {
        await boundsWithinHorizontalViewport(page, row);
      }
    },
  );

  test(
    'Add Model sheet is reachable and scrollable on mobile',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await setupCommon(page);
      const scenario = new GpuSessionScenario([
        { modelType: 'aisha-image', name: 'Aisha' },
        { modelType: 'aisha-image-lite', name: 'Aisha Lite' },
        { modelType: 'aisha-video', name: 'Aisha Video' },
        { modelType: 'grok-imagine-image', name: 'Grok Imagine' },
      ]);
      await scenario.install(page);
      scenario.startSession('aisha-image');
      scenario.completeBootstrap();

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Add model' })).toBeVisible({ timeout: 8000 });
      await page.getByRole('button', { name: 'Add model' }).click();

      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText('Aisha Lite')).toBeVisible();
      await expect(sheet).toHaveCSS('overflow', 'auto');
      const box = await boundsFitViewport(page, sheet);
      expect(box.height).toBeGreaterThan(0);

      // Reachable: every offered model option is scrolled-to-able and clickable within the sheet.
      const lastOption = sheet.getByText('Grok Imagine');
      await lastOption.scrollIntoViewIfNeeded();
      await expect(lastOption).toBeVisible();

      // The close control stays reachable above the bottom safe area.
      const viewport = page.viewportSize();
      const closeBox = await sheet.getByLabel('Close').boundingBox();
      if (!viewport || !closeBox) throw new Error('Close control is not measurable');
      expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(viewport.height + 1);
    },
  );

  test(
    'Remove confirmation remains within viewport on mobile',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await setupCommon(page);
      const scenario = new GpuSessionScenario([
        { modelType: 'aisha-image', name: 'Aisha' },
        { modelType: 'aisha-image-lite', name: 'Aisha Lite' },
      ]);
      await scenario.install(page);
      scenario.startSession('aisha-image');
      scenario.completeBootstrap();
      scenario.attachModel('aisha-image-lite');
      const restartOp = scenario.beginCohortRestart(['aisha-image', 'aisha-image-lite']);
      scenario.completeAttach('aisha-image-lite', restartOp);

      await page.goto('/app/sessions');
      const removeButton = page.getByRole('button', { name: 'Remove Aisha Lite' });
      await expect(removeButton).toBeVisible({ timeout: 8000 });
      await removeButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await boundsFitViewport(page, dialog);

      const viewport = page.viewportSize();
      const confirmBox = await dialog.getByRole('button', { name: 'Remove model' }).boundingBox();
      if (!viewport || !confirmBox) throw new Error('Confirm control is not measurable');
      expect(confirmBox.y + confirmBox.height).toBeLessThanOrEqual(viewport.height + 1);
    },
  );

  test(
    'Stop confirmation remains within viewport on mobile and Escape dismisses it',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await setupCommon(page);
      const scenario = new GpuSessionScenario([{ modelType: 'aisha-image', name: 'Aisha' }]);
      await scenario.install(page);
      scenario.startSession('aisha-image');
      scenario.completeBootstrap();

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 8000 });
      await page.getByRole('button', { name: 'Stop' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Estimated final tokens')).toBeVisible({ timeout: 5000 });
      await boundsFitViewport(page, dialog);

      const viewport = page.viewportSize();
      const cancelBox = await dialog.getByRole('button', { name: 'Keep Running' }).boundingBox();
      if (!viewport || !cancelBox) throw new Error('Cancel control is not measurable');
      expect(cancelBox.y + cancelBox.height).toBeLessThanOrEqual(viewport.height + 1);

      // Native <dialog> Escape/cancel semantics — the same path across Chromium and WebKit.
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    },
  );

  test(
    'Mobile navigation remains usable after opening and closing a session dialog',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await setupCommon(page);
      const scenario = new GpuSessionScenario([{ modelType: 'aisha-image', name: 'Aisha' }]);
      await scenario.install(page);
      scenario.startSession('aisha-image');
      scenario.completeBootstrap();

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 8000 });
      await page.getByRole('button', { name: 'Stop' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Estimated final tokens')).toBeVisible({ timeout: 5000 });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      // The bottom tab bar remains usable — a dismissed dialog must not leave the app inert.
      const bottomTabs = page.locator('.btm-tabs');
      await expect(bottomTabs.getByRole('link', { name: 'Create' })).toBeVisible();
      await bottomTabs.getByRole('link', { name: 'Create' }).click();
      await expect(page).toHaveURL(/\/app\/create/);
    },
  );

  test(
    'Create session panel and operation progress do not overlap the sticky Generate bar',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await setupCommon(page);
      const scenario = new GpuSessionScenario([{ modelType: 'aisha-image', name: 'Aisha' }]);
      await scenario.install(page);
      scenario.startSession('aisha-image');

      await page.goto('/app/create?prompt=lifecycle+test');
      await page.getByRole('button', { name: /Aisha$/ }).click();
      await expect(page.getByText('Starting…')).toBeVisible({ timeout: 8000 });

      // The session panel is the last item in the scrollable mobile column, reserved space (the
      // column's bottom padding) is what is actually under test — scroll it into view first.
      const sessionPanel = page.locator('.panel', { hasText: 'Starting…' });
      await sessionPanel.scrollIntoViewIfNeeded();
      const sessionPanelBox = await sessionPanel.boundingBox();
      const generateBarBox = await page
        .getByRole('button', { name: /Generate/i })
        .last()
        .boundingBox();
      if (!sessionPanelBox || !generateBarBox) {
        throw new Error('Session panel or sticky Generate bar is not measurable');
      }
      // The panel's bottom edge sits above the sticky bar's top edge — no visual overlap once
      // scrolled fully into view.
      expect(sessionPanelBox.y + sessionPanelBox.height).toBeLessThanOrEqual(generateBarBox.y + 1);
    },
  );
});
