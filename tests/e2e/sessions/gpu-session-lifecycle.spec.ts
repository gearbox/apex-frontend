import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';
import {
  attachScenarioModelFromSessionsPage,
  GpuSessionScenario,
  startActiveGpuSessionScenario,
} from '../helpers/gpuSessionScenario';

/**
 * Phase 3 workstream 1 — cross-surface lifecycle integration.
 *
 * These specs drive one coherent backend narrative (see `GpuSessionScenario`) across both
 * /app/create and /app/sessions, proving the frontend stays coherent through the full lifecycle
 * rather than only in per-operation isolation. They complement, and do not replace, the existing
 * focused specs in sessions.spec.ts and card-state-machine.spec.ts.
 *
 * Browser-independent: runs once in desktop Chromium, matching this repo's convention that
 * cross-browser tags are reserved for behavior that is actually browser- or touch-dependent
 * (see docs/ci-test-suite.md). Mobile-specific layout coverage for these same surfaces lives in
 * sessions-mobile.spec.ts.
 */

async function setupCommon(page: import('@playwright/test').Page) {
  await page.route((url) => url.pathname === '/v1/billing/pricing', jsonRoute([]));
}

test.describe('GPU session cross-surface lifecycle', () => {
  test('start, attach, pause/resume, remove, and stop stay coherent across Create and Sessions, including out-of-order snapshots', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    await setupCommon(page);

    const scenario = new GpuSessionScenario([
      { modelType: 'aisha-image', name: 'Aisha' },
      { modelType: 'aisha-image-lite', name: 'Aisha Lite' },
    ]);
    await scenario.install(page);

    await test.step('A. Initial state — available provider, runtime none, no session', async () => {
      await page.goto('/app/create?prompt=lifecycle+test');
      await expect(page.getByRole('button', { name: /Aisha$/ })).toBeVisible({
        timeout: 5000,
      });
      await page.getByRole('button', { name: /Aisha$/ }).click();
      await expect(page.getByText('Needs GPU session')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();

      await page.goto('/app/sessions');
      await expect(page.getByText('No active sessions. Start one below.')).toBeVisible({
        timeout: 5000,
      });
    });

    await test.step('B. Start — none -> provisioning -> active, via a valid session_bootstrap operation', async () => {
      await page.getByRole('button', { name: 'Start Session' }).click();
      await expect(page.getByText('Provisioning')).toBeVisible({ timeout: 8000 });
      // A queued operation at revision 0 is a valid first state, not a loading failure.
      await expect(page.getByText("Couldn't load session details.")).not.toBeVisible();

      scenario.completeBootstrap();
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 12_000 });

      // Create reflects the same server-provided runtime: Generate becomes enabled there too.
      await page.goto('/app/create?prompt=lifecycle+test');
      await page.getByRole('button', { name: /Aisha$/ }).click();
      await expect(page.getByText('Session active')).toBeVisible({ timeout: 8000 });
      await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeEnabled();
    });

    await test.step('C. Attach another model — none -> provisioning -> suspended -> active', async () => {
      await attachScenarioModelFromSessionsPage(page, scenario, 'Aisha Lite');
      expect(scenario.attachRequestBodies().at(-1)).toEqual({ model: 'aisha-image-lite' });
      // The operation is immediately visible from the canonical cache on attach's 202 response.
      await expect(page.getByText('Deploying')).toBeVisible({ timeout: 5000 });
      // The original deployment remains correctly represented alongside the new one.
      await expect(page.getByLabel('Deployed models').locator('article')).toHaveCount(2);

      // Out-of-order delivery #1: provider runtime moves to `suspended` (cohort restart) before
      // session detail catches up. Card state must come only from provider runtime, never a
      // third state derived from a stale session-detail deployment scalar.
      scenario.freezeSessionDetail();
      const restartOp = scenario.beginCohortRestart(['aisha-image', 'aisha-image-lite']);

      await page.goto('/app/create?prompt=lifecycle+test');
      await page.getByRole('button', { name: /Aisha$/ }).click();
      await expect(page.getByText('Restarting')).toBeVisible({ timeout: 8000 });
      await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();

      scenario.unfreezeSessionDetail();
      scenario.completeAttach('aisha-image-lite', restartOp);

      await expect(page.getByText('Session active')).toBeVisible({ timeout: 12_000 });
      await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeEnabled();

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Remove Aisha Lite' })).toBeVisible({
        timeout: 8000,
      });
    });

    await test.step('D. Pause / resume — coherent across both surfaces, entered from either one', async () => {
      await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();
      await page.getByRole('button', { name: 'Pause' }).click();
      await expect(page.getByText('Paused')).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

      await page.goto('/app/create?prompt=lifecycle+test');
      await page.getByRole('button', { name: /Aisha$/ }).click();
      await expect(page.getByText('Session is paused. Manage it in Sessions.')).toBeVisible({
        timeout: 8000,
      });
      await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();

      // Resume from Create this time — coherence must not depend on the entry surface.
      await page.getByRole('button', { name: 'Resume' }).click();
      await expect(page.getByText('Session active')).toBeVisible({ timeout: 8000 });
      await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeEnabled();

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 8000 });
    });

    await test.step('E. Remove the additive deployment — non-force path, providers lagging session detail', async () => {
      await expect(page.getByRole('button', { name: 'Remove Aisha Lite' })).toBeVisible({
        timeout: 8000,
      });

      // Out-of-order delivery #2 (the opposite direction from step C): freeze `/v1/providers` on
      // its pre-removal snapshot so session detail reconciles first this time.
      scenario.freezeProviders();

      await page.getByRole('button', { name: 'Remove Aisha Lite' }).click();
      const removeDialog = page.getByRole('dialog');
      await expect(removeDialog.getByRole('button', { name: 'Remove model' })).toBeVisible();
      await expect(removeDialog.getByText(/keep running and billing/i)).not.toBeVisible();
      await removeDialog.getByRole('button', { name: 'Remove model' }).click();

      await expect.poll(() => scenario.deleteRequestUrls().length).toBe(1);
      expect(scenario.deleteRequestUrls()[0]).not.toContain('force=true');
      // Session detail (not frozen) reconciles immediately.
      await expect(page.getByText('Removing')).toBeVisible({ timeout: 8000 });

      // Create, switched to the model being removed, still reads the stale (frozen) provider
      // runtime. Two independent, unversioned snapshots may disagree transiently — rendering
      // must not block on them agreeing, nor synthesize a third state from the disagreement.
      await page.goto('/app/create?prompt=lifecycle+test');
      await page.getByRole('button', { name: 'Aisha Lite' }).click();
      await expect(page.getByText('Session active')).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeEnabled();

      scenario.unfreezeProviders();
      scenario.completeRemoval(scenario.deploymentIdFor('aisha-image-lite'));

      // Provider runtime catches up to `none` — the removed model becomes eligible again, never
      // a synthetic "failed"/"removed" runtime state.
      await expect(page.getByText('Needs GPU session')).toBeVisible({ timeout: 12_000 });

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Remove Aisha Lite' })).toHaveCount(0, {
        timeout: 8000,
      });
      // The remaining primary model stays usable.
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    });

    await test.step('F. Stop — two-call preview/confirm protocol', async () => {
      scenario.setStopPreview({ estimated_final_tokens: 777 });
      await page.getByRole('button', { name: 'Stop' }).click();

      const stopDialog = page.getByRole('dialog');
      await expect(stopDialog.getByText('Estimated final tokens')).toBeVisible({ timeout: 5000 });
      await expect(stopDialog.getByText('777')).toBeVisible();
      // Preview alone does not teardown.
      expect(scenario.requestCount('POST stop confirmed')).toBe(0);

      await stopDialog.getByRole('button', { name: 'Stop Session' }).click();
      await expect(stopDialog).toHaveCount(0, { timeout: 5000 });

      scenario.finishStop();
      await expect(page.getByText('No active sessions. Start one below.')).toBeVisible({
        timeout: 15_000,
      });

      await page.goto('/app/create?prompt=lifecycle+test');
      await page.getByRole('button', { name: /Aisha$/ }).click();
      await expect(page.getByText('Needs GPU session')).toBeVisible({ timeout: 8000 });
      await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();
    });
  });
});

test.describe('GPU session failure and recovery', () => {
  test('a failed additive attach keeps runtime at none while Sessions retains the failure context, and the model becomes attachable again', async ({
    authenticatedPage: page,
  }) => {
    await setupCommon(page);
    const scenario = await startActiveGpuSessionScenario(
      page,
      [
        { modelType: 'aisha-image', name: 'Aisha' },
        { modelType: 'aisha-image-lite', name: 'Aisha Lite' },
      ],
      'aisha-image',
    );

    await attachScenarioModelFromSessionsPage(page, scenario, 'Aisha Lite');
    await expect(page.getByText('Deploying')).toBeVisible({ timeout: 5000 });

    scenario.failAttach('aisha-image-lite', 'Bundle provisioning failed: disk quota exceeded');

    // Sessions retains the failed deployment and its error context — no Remove control for it, and
    // the deployment stays visible rather than silently disappearing.
    await expect(page.getByText('Failed', { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Bundle provisioning failed: disk quota exceeded')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Aisha Lite' })).toHaveCount(0);

    // Create must not invent a `failed` runtime state — the model reports `none`, exactly like
    // "never provisioned", and becomes attachable again.
    await page.goto('/app/create?prompt=lifecycle+test');
    await page.getByRole('button', { name: 'Aisha Lite' }).click();
    await expect(page.getByText('Needs GPU session')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Session unreachable')).not.toBeVisible();

    await page.goto('/app/sessions');
    await page.getByRole('button', { name: 'Add model' }).click();
    await expect(page.getByRole('dialog').getByText('Aisha Lite')).toBeVisible({ timeout: 5000 });
  });

  test('a stale session reports unreachable on Create and Sessions without a synthetic failure state', async ({
    authenticatedPage: page,
  }) => {
    await setupCommon(page);
    const scenario = await startActiveGpuSessionScenario(
      page,
      [{ modelType: 'aisha-image', name: 'Aisha' }],
      'aisha-image',
    );

    await page.goto('/app/create?prompt=lifecycle+test');
    await page.getByRole('button', { name: /Aisha$/ }).click();
    await expect(page.getByText('Session active')).toBeVisible({ timeout: 8000 });

    scenario.markStale();

    await expect(page.getByText('Session unreachable')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Stop session' })).toBeVisible();

    await page.goto('/app/sessions');
    await expect(page.getByText('Stale')).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  });
});
