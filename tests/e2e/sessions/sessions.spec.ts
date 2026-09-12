import { test, expect } from '../fixtures/auth.fixture';
import type { Page, Route } from '@playwright/test';
import type { components } from '../../../src/lib/api/types';
import {
  makeAishaImageLiteModelInfo,
  makeAishaImageModelInfo,
} from '../../../src/mocks/factories/providers';
import {
  makeDeploymentResponse,
  makeGpuSessionListResponse,
  makeGpuSessionResponse,
  makeOperationResponse,
  makeStopConfirmationResponse,
} from '../../../src/mocks/factories/session';
import { jsonRoute } from '../helpers/api';
import { makeAishaProviderResponse, makeModelRuntime } from '../helpers/providers';

// ── Mock data ─────────────────────────────────────────────────────────────────

type GpuSessionResponse = components['schemas']['GpuSessionResponse'];
type DeploymentResponse = components['schemas']['DeploymentResponse'];

const mockProviders = makeAishaProviderResponse();

const mockProvidersWithDistinctProvisioningHints = makeAishaProviderResponse({
  models: [
    makeAishaImageModelInfo({
      runtime: makeModelRuntime(),
      provisioning: { typical_bootstrap_seconds: 600, typical_attach_seconds: 360 },
    }),
    makeAishaImageLiteModelInfo({
      runtime: makeModelRuntime(),
      provisioning: { typical_bootstrap_seconds: 180, typical_attach_seconds: 120 },
    }),
  ],
});

const mockProvisioningSession = makeGpuSessionResponse({
  id: 'sess_prov',
  status: 'provisioning',
  tunnel_hostname: null,
  vastai_gpu_name: null,
  started_at: null,
  deployments: [
    makeDeploymentResponse({ id: 'deploy_prov', status: 'deploying', activated_at: null }),
  ],
});

const mockActiveSession: GpuSessionResponse & { deployments: DeploymentResponse[] } = {
  ...makeGpuSessionResponse({
    id: 'sess_active',
    status: 'active',
    tunnel_hostname: 'tunnel.example.com',
    vastai_gpu_name: 'RTX 4090',
    started_at: '2026-06-20T00:01:00Z',
  }),
  // Existing focused specs intentionally model an active session while its primary deployment
  // still reconciles as deploying; keep that state explicit rather than hiding it in the factory.
  deployments: [
    makeDeploymentResponse({ id: 'deploy_prov', status: 'deploying', activated_at: null }),
  ],
};

const mockStopPreview = makeStopConfirmationResponse({
  session_id: 'sess_active',
  message: 'This will stop your session.',
});

// Helper: route handler that dispatches on pathname + method
function makeSessionRouter(opts: {
  sessions?: GpuSessionResponse[];
  onStart?: () => GpuSessionResponse;
  stopPreview?: components['schemas']['StopConfirmationResponse'];
}) {
  return async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    // POST /v1/sessions → start session
    if (method === 'POST' && path === '/v1/sessions') {
      const body = opts.onStart?.() ?? mockProvisioningSession;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    // POST /v1/sessions/:id/stop → two-call stop
    if (method === 'POST' && path.endsWith('/stop')) {
      const reqBody = JSON.parse(route.request().postData() ?? '{}') as { confirmed?: boolean };
      if (!reqBody.confirmed) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(opts.stopPreview ?? mockStopPreview),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockActiveSession, status: 'stopping' }),
      });
    }
    // GET /v1/sessions/:id → detail
    if (method === 'GET' && path !== '/v1/sessions') {
      const s = opts.sessions?.[0] ?? mockActiveSession;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(s),
      });
    }
    // GET /v1/sessions → list
    const list = opts.sessions ?? [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeGpuSessionListResponse(list)),
    });
  };
}

async function installDeploymentRemovalRoutes(
  page: Page,
  {
    detail,
    targetDeployment,
    operationId,
    deleteUrls,
  }: {
    detail: GpuSessionResponse;
    targetDeployment: DeploymentResponse;
    operationId: string;
    deleteUrls: string[];
  },
): Promise<void> {
  const list = makeGpuSessionListResponse([detail]);
  await page.route(
    (url) => url.pathname.startsWith('/v1/sessions'),
    async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'DELETE') {
        deleteUrls.push(url.toString());
        return route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            deployment: { ...targetDeployment, status: 'removing' },
            operation: makeOperationResponse({
              id: operationId,
              session_id: detail.id,
              deployment_id: targetDeployment.id,
              kind: 'bundle_removal',
            }),
          }),
        });
      }
      if (url.pathname === `/v1/sessions/${detail.id}`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(detail),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(list),
      });
    },
  );
}

// ── beforeEach shared setup ───────────────────────────────────────────────────

async function setupCommon(page: Page) {
  // Function-predicate routing is the most reliable (no glob query-param issues)
  await page.route((url) => url.pathname === '/v1/providers', jsonRoute(mockProviders));
  await page.route((url) => url.pathname === '/v1/billing/pricing', jsonRoute([]));
  await page.route(
    (url) => url.pathname === '/v1/events/sse-ticket',
    jsonRoute({ ticket: 'test-ticket' }),
  );
  await page.route(
    (url) => url.pathname === '/v1/events/stream',
    (route) => route.abort(),
  );
}

// ── Sessions page tests ───────────────────────────────────────────────────────

test.describe('Sessions page', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await setupCommon(page);
  });

  test('1. Renders sessions page with Start Session button', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname.startsWith('/v1/sessions'), jsonRoute({ sessions: [] }));
    await page.goto('/app/sessions');

    await expect(page.getByText('GPU Sessions')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Start Session' })).toBeVisible();
  });

  test('1.1. Selected model updates its typical provisioning hint from the provider snapshot', async ({
    authenticatedPage: page,
  }) => {
    await page.route(
      (url) => url.pathname === '/v1/providers',
      jsonRoute(mockProvidersWithDistinctProvisioningHints),
    );
    await page.route((url) => url.pathname.startsWith('/v1/sessions'), jsonRoute({ sessions: [] }));
    await page.goto('/app/sessions');

    await expect(page.getByText(/This model usually takes around 10m to provision/)).toBeVisible({
      timeout: 5000,
    });

    await page.getByLabel('Model').selectOption('aisha-image-lite');

    await expect(page.getByText(/This model usually takes around 3m to provision/)).toBeVisible();
  });

  test(
    '2. Start session → provisioning without legacy raw progress parsing',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      let listCallCount = 0;
      await page.route(
        (url) => url.pathname.startsWith('/v1/sessions'),
        async (route) => {
          const url2 = new URL(route.request().url());
          const method = route.request().method();
          const path = url2.pathname;

          if (method === 'POST' && path === '/v1/sessions') {
            listCallCount = 1; // mark as started so next list returns provisioning session
            return route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(mockProvisioningSession),
            });
          }
          if (method === 'GET' && path !== '/v1/sessions') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(mockProvisioningSession),
            });
          }
          // List: first call returns empty, subsequent calls return provisioning session
          const sessions = listCallCount > 0 ? [mockProvisioningSession] : [];
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(makeGpuSessionListResponse(sessions)),
          });
        },
      );

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Start Session' })).toBeVisible({
        timeout: 5000,
      });
      await page.getByRole('button', { name: 'Start Session' }).click();

      await expect(page.getByText('provisioning')).toBeVisible({ timeout: 8000 });
      await expect(page.getByRole('progressbar')).not.toBeVisible();
    },
  );

  test('3. Active session shows Stop button', async ({ authenticatedPage: page }) => {
    await page.route(
      (url) => url.pathname.startsWith('/v1/sessions'),
      makeSessionRouter({ sessions: [mockActiveSession] }),
    );
    await page.goto('/app/sessions');

    // SessionCard renders a "Stop" button for active sessions
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 5000 });
  });

  test('4. Two-call stop: preview renders then confirm stops session', async ({
    authenticatedPage: page,
  }) => {
    await page.route(
      (url) => url.pathname.startsWith('/v1/sessions'),
      makeSessionRouter({
        sessions: [mockActiveSession],
        stopPreview: mockStopPreview,
      }),
    );

    await page.goto('/app/sessions');
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Stop' }).click();

    // StopSessionModal calls previewStop on mount — shows estimated_final_tokens
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Estimated final tokens')).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('500')).toBeVisible();

    // Confirm stop with the "Stop Session" button
    await page.getByRole('button', { name: 'Stop Session' }).click();

    // Modal closes after successful stop
    await expect(page.getByText('Estimated final tokens')).not.toBeVisible({ timeout: 5000 });
  });

  test('5. Sessions nav entry appears in desktop sidebar', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app/create');

    // DesktopSidebar renders a Sessions link (from nav items array)
    await expect(page.getByRole('link', { name: /Sessions/i })).toBeVisible({ timeout: 5000 });
  });

  test('6. Unavailable provider does not offer Start', async ({ authenticatedPage: page }) => {
    await page.route(
      (url) => url.pathname === '/v1/providers',
      jsonRoute(makeAishaProviderResponse({ available: false })),
    );
    await page.route((url) => url.pathname.startsWith('/v1/sessions'), jsonRoute({ sessions: [] }));

    await page.goto('/app/sessions');

    await expect(page.getByRole('button', { name: 'Start Session' })).not.toBeVisible({
      timeout: 5000,
    });
  });

  test(
    '7. Final-active removal warns about billing and sends force only after confirmation',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      const activeDeployment = makeDeploymentResponse({ id: 'deploy_active' });
      const deployingSibling = makeDeploymentResponse({
        id: 'deploy_deploying',
        model_type: 'aisha-image-lite',
        status: 'deploying',
        is_primary: false,
        activated_at: null,
      });
      const detail = { ...mockActiveSession, deployments: [activeDeployment, deployingSibling] };
      const deleteUrls: string[] = [];

      await installDeploymentRemovalRoutes(page, {
        detail,
        targetDeployment: activeDeployment,
        operationId: 'op_remove',
        deleteUrls,
      });

      await page.goto('/app/sessions');
      const remove = page.getByRole('button', { name: 'Remove' });
      await expect(remove).toBeVisible({ timeout: 5000 });
      await remove.focus();
      await remove.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/keep running and billing until you stop it/i)).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Remove last model anyway' })).toBeVisible();
      expect(deleteUrls).toHaveLength(0);

      await page.getByRole('button', { name: 'Remove last model anyway' }).click();
      await expect.poll(() => deleteUrls.length).toBe(1);
      expect(deleteUrls[0]).toContain('force=true');
    },
  );

  test(
    '8. Invalid session and deployment states do not expose Remove',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      const paused = makeGpuSessionResponse({
        ...mockActiveSession,
        id: 'sess_paused',
        status: 'paused',
        deployments: [
          { ...mockActiveSession.deployments[0], id: 'paused_active', status: 'active' },
        ],
      });
      const activeWithInvalidDeployments = makeGpuSessionResponse({
        ...mockActiveSession,
        id: 'sess_invalid_deployments',
        deployments: [
          { ...mockActiveSession.deployments[0], id: 'deploying', status: 'deploying' },
          { ...mockActiveSession.deployments[0], id: 'failed', status: 'failed' },
          { ...mockActiveSession.deployments[0], id: 'removing', status: 'removing' },
        ],
      });
      const details = new Map([
        [paused.id, paused],
        [activeWithInvalidDeployments.id, activeWithInvalidDeployments],
      ]);
      const list = makeGpuSessionListResponse([...details.values()]);

      await page.route(
        (url) => url.pathname.startsWith('/v1/sessions'),
        async (route) => {
          const path = new URL(route.request().url()).pathname;
          const detail = [...details.entries()].find(([id]) => path === `/v1/sessions/${id}`)?.[1];
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(detail ?? list),
          });
        },
      );

      await page.goto('/app/sessions');
      await expect(page.getByRole('button', { name: 'Stop' }).first()).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    },
  );

  test(
    '9. Pause (zero in-flight jobs) and Resume round-trip through reconciled state',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      let pausePosted = false;
      let resumePosted = false;
      let status: 'active' | 'paused' = 'active';

      await page.route(
        (url) => url.pathname.startsWith('/v1/sessions'),
        async (route) => {
          const url = new URL(route.request().url());
          const method = route.request().method();

          if (method === 'POST' && url.pathname.endsWith('/pause')) {
            pausePosted = true;
            status = 'paused';
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ...mockActiveSession, status, in_flight_job_count: 0 }),
            });
          }
          if (method === 'POST' && url.pathname.endsWith('/resume')) {
            resumePosted = true;
            status = 'active';
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ...mockActiveSession, status, in_flight_job_count: 0 }),
            });
          }
          if (method === 'GET' && url.pathname !== '/v1/sessions') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ...mockActiveSession, status, in_flight_job_count: 0 }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(makeGpuSessionListResponse([{ ...mockActiveSession, status }])),
          });
        },
      );

      await page.goto('/app/sessions');
      const pauseButton = page.getByRole('button', { name: 'Pause' });
      await expect(pauseButton).toBeVisible({ timeout: 5000 });
      await expect(pauseButton).toBeEnabled();
      await pauseButton.click();

      await expect.poll(() => pausePosted).toBe(true);
      await expect(page.getByText('Paused')).toBeVisible({ timeout: 5000 });
      const resumeButton = page.getByRole('button', { name: 'Resume' });
      await expect(resumeButton).toBeVisible();

      await resumeButton.click();
      await expect.poll(() => resumePosted).toBe(true);
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Active')).toBeVisible();
    },
  );

  test(
    '10. Attach sends the correct POST body and shows the new deployment provisioning',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      const providersWithSecondModel = makeAishaProviderResponse({
        models: [
          makeAishaImageModelInfo({ runtime: makeModelRuntime() }),
          makeAishaImageLiteModelInfo({ runtime: makeModelRuntime() }),
        ],
      });
      await page.route(
        (url) => url.pathname === '/v1/providers',
        jsonRoute(providersWithSecondModel),
      );

      const attachOperation = makeOperationResponse({
        id: 'op_attach',
        session_id: mockActiveSession.id,
        deployment_id: 'deploy_new',
        kind: 'bundle_provision',
      });
      const attachedDeployment = makeDeploymentResponse({
        id: 'deploy_new',
        model_type: 'aisha-image-lite',
        status: 'deploying',
        is_primary: false,
        created_at: '2026-06-20T00:02:00Z',
        activated_at: null,
        current_operation: attachOperation,
      });
      const attachRequestBodies: unknown[] = [];
      let attached = false;

      await page.route(
        (url) => url.pathname.startsWith('/v1/sessions'),
        async (route) => {
          const url = new URL(route.request().url());
          const method = route.request().method();

          if (method === 'POST' && url.pathname.endsWith('/deployments')) {
            attachRequestBodies.push(JSON.parse(route.request().postData() ?? '{}'));
            attached = true;
            return route.fulfill({
              status: 202,
              contentType: 'application/json',
              body: JSON.stringify({
                deployment: attachedDeployment,
                operation: attachOperation,
              }),
            });
          }
          if (method === 'GET' && url.pathname !== '/v1/sessions') {
            const deployments = attached
              ? [mockActiveSession.deployments[0], attachedDeployment]
              : [mockActiveSession.deployments[0]];
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ...mockActiveSession, deployments }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(makeGpuSessionListResponse([mockActiveSession])),
          });
        },
      );

      await page.goto('/app/sessions');
      await page.getByRole('button', { name: 'Add model' }).click();
      await page.getByRole('dialog').getByText('Aisha Lite').click();

      await expect.poll(() => attachRequestBodies.length).toBe(1);
      expect(attachRequestBodies[0]).toEqual({ model: 'aisha-image-lite' });

      // Scope to the deployments list so the pre-existing primary deployment (also
      // "Deploying" in this fixture) can't collide with the newly attached row.
      const newDeploymentRow = page
        .locator('.deployments')
        .getByRole('article')
        .filter({ hasText: 'Aisha Lite' });
      await expect(newDeploymentRow.getByText('Deploying')).toBeVisible({ timeout: 5000 });
    },
  );

  test(
    '11. A stale Add Model sheet does not submit once the session leaves active',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      test.setTimeout(45_000);
      // Session detail deliberately never refetches on window focus (there is no real focus
      // fan-out to fix). Force immediate SSE fallback instead, so the bounded 8s detail poll is
      // what picks up the reconciled status — the same path a real backend event would take.
      await page.route(
        (url) => url.pathname === '/v1/events/sse-ticket',
        (route) => route.fulfill({ status: 503 }),
      );
      const providersWithSecondModel = makeAishaProviderResponse({
        models: [
          makeAishaImageModelInfo({ runtime: makeModelRuntime() }),
          makeAishaImageLiteModelInfo({ runtime: makeModelRuntime() }),
        ],
      });
      await page.route(
        (url) => url.pathname === '/v1/providers',
        jsonRoute(providersWithSecondModel),
      );

      let attachPosted = false;
      let sessionStatus: 'active' | 'paused' = 'active';

      await page.route(
        (url) => url.pathname.startsWith('/v1/sessions'),
        async (route) => {
          const url = new URL(route.request().url());
          const method = route.request().method();

          if (method === 'POST' && url.pathname.endsWith('/deployments')) {
            attachPosted = true;
            return route.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
          }
          if (method === 'GET' && url.pathname !== '/v1/sessions') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ...mockActiveSession, status: sessionStatus }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              makeGpuSessionListResponse([{ ...mockActiveSession, status: sessionStatus }]),
            ),
          });
        },
      );

      await page.goto('/app/sessions');
      await page.getByRole('button', { name: 'Add model' }).click();
      await expect(page.getByRole('dialog').getByText('Aisha Lite')).toBeVisible({ timeout: 5000 });

      // The session leaves 'active' (e.g. reconciled from a backend event) while the sheet stays
      // open with its now-stale model list still on screen. The fallback poll picks it up.
      sessionStatus = 'paused';
      await expect(page.getByText('Paused').first()).toBeVisible({ timeout: 15_000 });

      await page.getByRole('dialog').getByText('Aisha Lite').click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(attachPosted).toBe(false);
    },
  );

  test(
    '12. Normal non-force remove: active target with another active sibling omits force',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }) => {
      const targetDeployment = makeDeploymentResponse({ id: 'deploy_target' });
      const activeSibling = makeDeploymentResponse({
        id: 'deploy_sibling',
        model_type: 'aisha-image-lite',
        is_primary: false,
      });
      const detail = { ...mockActiveSession, deployments: [targetDeployment, activeSibling] };
      const deleteUrls: string[] = [];

      await installDeploymentRemovalRoutes(page, {
        detail,
        targetDeployment,
        operationId: 'op_remove_normal',
        deleteUrls,
      });

      await page.goto('/app/sessions');
      const remove = page.getByRole('button', { name: 'Remove Aisha' }).first();
      await expect(remove).toBeVisible({ timeout: 5000 });
      await remove.click();

      const dialog = page.getByRole('dialog');
      // The ordinary path shows the plain confirmation, not the final-active-deployment warning.
      await expect(dialog.getByRole('button', { name: 'Remove model' })).toBeVisible();
      await expect(dialog.getByText(/keep running and billing/i)).not.toBeVisible();

      await dialog.getByRole('button', { name: 'Remove model' }).click();
      await expect.poll(() => deleteUrls.length).toBe(1);
      expect(deleteUrls[0]).not.toContain('force=true');
    },
  );
});

// ── Create page hook tests ────────────────────────────────────────────────────

test.describe('Sessions page — create page hook', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await setupCommon(page);
  });

  test('7. On-demand model without active session disables Generate and shows Start session button', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');

    // The page auto-selects the first available model (Aisha, the only on-demand model here).
    // Clicking the Aisha button explicitly confirms the model selection is reflected in the UI.
    await expect(page.getByRole('button', { name: 'Aisha' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Aisha' }).click();

    // NEEDS_SESSION panel: badge + in-place Start session button (no redirect to /app/sessions)
    await expect(page.getByText(/Needs GPU session/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: /Start session/i })).toBeVisible();

    // Generate button(s) should be disabled
    const generateBtns = page.getByRole('button', { name: /Generate/i });
    await expect(generateBtns.first()).toBeDisabled();
  });

  test('8. 409 no_active_gpu_session on generate shows action toast', async ({
    authenticatedPage: page,
  }) => {
    // Provider with an active runtime (so Generate is enabled).
    const activeSessionProviders = makeAishaProviderResponse({
      runtime: makeModelRuntime('active', {
        session_id: 'sess_active',
        deployment_id: 'deploy_active',
      }),
    });
    await page.route((url) => url.pathname === '/v1/providers', jsonRoute(activeSessionProviders));
    await page.route(
      (url) => url.pathname === '/v1/generate',
      jsonRoute(
        { error: 'no_active_gpu_session', message: 'No active GPU session.', status_code: 409 },
        409,
      ),
    );

    await page.goto('/app/create');

    // Select aisha-image model
    await expect(page.getByRole('button', { name: 'Aisha' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Aisha' }).click();

    // Type a prompt
    const promptTextarea = page.locator('textarea').first();
    await promptTextarea.fill('test prompt');

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();
    await expect(generateBtn).toBeEnabled({ timeout: 3000 });
    await generateBtn.click();

    // Scope this assertion to the alert so the model guide description cannot
    // satisfy it before the generation error toast appears.
    await expect(page.getByRole('alert').filter({ hasText: /No active GPU session/i })).toBeVisible(
      {
        timeout: 5000,
      },
    );
  });
});
