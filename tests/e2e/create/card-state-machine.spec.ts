import { test, expect } from '../fixtures/auth.fixture';
import { test as anonTest, type Page } from '@playwright/test';
import type { components } from '../../../src/lib/api/types';
import { generationModes, makeGrokImageModelInfo } from '../../../src/mocks/factories/providers';
import {
  makeDeploymentResponse,
  makeGpuSessionListResponse,
  makeGpuSessionResponse,
  makeStopConfirmationResponse,
} from '../../../src/mocks/factories/session';
import {
  makeAishaProviderResponse,
  makeGrokProviderResponse,
  makeModelRuntime,
} from '../helpers/providers';

type GpuSessionStatus = components['schemas']['GpuSessionStatus'];

const makeSession = (status: GpuSessionStatus, id = 'sess_mock') =>
  makeGpuSessionResponse({
    id,
    status,
    tunnel_hostname: status === 'active' ? 'tunnel.example.com' : null,
    started_at: status === 'active' ? '2026-06-20T00:01:00Z' : null,
    deployments: [makeDeploymentResponse({ id: 'deploy_mock' })],
  });

function setupCommonRoutes(page: Page) {
  return Promise.all([
    page.route('**/v1/billing/pricing', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    ),
    page.route('**/v1/events', (r) => r.abort()),
  ]);
}

// ── 1. Anonymous: (app) layout guard redirects to /login before the create page renders ──────────
// Note: SIGN_IN_REQUIRED card state is defensive UI and unreachable under the (app) auth guard.
anonTest(
  'Anonymous user is redirected to /login for an on_demand create route',
  async ({ page }) => {
    await page.route('**/v1/auth/refresh', (r) =>
      r.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      }),
    );
    await page.route('**/v1/billing/balance', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ balance: 0 }),
      }),
    );
    await page.route('**/v1/billing/pricing', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route('**/v1/providers', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeAishaProviderResponse()),
      }),
    );
    await page.route('**/v1/sessions', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      }),
    );
    await page.route('**/v1/events', (r) => r.abort());

    await page.goto('/app/create');

    // Should redirect to /login for unauthenticated users
    await expect(page).toHaveURL(/\/login/);
  },
);

// ── 2. Unavailable: on_demand available:false → UNAVAILABLE, no Start ─────────
test('Unavailable model shows no Start CTA (finding-#3 regression guard)', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeAishaProviderResponse({ available: false })),
    }),
  );
  await page.route('**/v1/sessions', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [] }),
    }),
  );

  await page.goto('/app/create');

  await expect(page.getByText(/Temporarily unavailable/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Start session/i })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();
});

// ── 3. NEEDS_SESSION → Start → PROVISIONING ──────────────────────────────────
test('NEEDS_SESSION: Start triggers mutation and shows Cancel during provisioning', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);

  let sessionState: components['schemas']['RuntimeState'] = 'none';
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeAishaProviderResponse({ runtime: makeModelRuntime(sessionState) })),
    }),
  );

  // Single handler for /v1/sessions (exact path — does NOT swallow /v1/sessions/*/stop)
  await page.route(
    (url) => url.pathname === '/v1/sessions',
    async (r) => {
      if (r.request().method() === 'POST') {
        sessionState = 'provisioning';
        await r.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(makeSession('pending', 'sess_new')),
        });
      } else {
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            sessionState === 'none'
              ? { sessions: [] }
              : makeGpuSessionListResponse([makeSession('provisioning')]),
          ),
        });
      }
    },
  );

  await page.goto('/app/create');

  // Initial NEEDS_SESSION state
  await expect(page.getByText(/Needs GPU session/i)).toBeVisible();
  const startBtn = page.getByRole('button', { name: /Start session/i });
  await expect(startBtn).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();

  // Click Start → POST fires, mutation invalidates providers+sessions → both refetch
  await startBtn.click();

  // Now PROVISIONING: "Starting…" badge + Cancel, Generate still disabled
  await expect(page.getByText(/Starting…/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start session/i })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();
});

test('runtime session ID drives Cancel while the sessions-list snapshot is empty', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        makeAishaProviderResponse({ runtime: makeModelRuntime('provisioning') }),
      ),
    }),
  );
  // Deliberately disagree with the authoritative runtime association.
  await page.route(
    (url) => url.pathname === '/v1/sessions',
    (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      }),
  );
  await page.route('**/v1/sessions/sess_mock', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeSession('provisioning')),
    }),
  );
  let previewTarget: string | null = null;
  await page.route('**/v1/sessions/*/stop', async (r) => {
    previewTarget = new URL(r.request().url()).pathname;
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        makeStopConfirmationResponse({
          active_duration_seconds: 0,
          estimated_final_tokens: 0,
          message: 'Cancel this session.',
        }),
      ),
    });
  });

  await page.goto('/app/create');

  await expect(page.getByText(/Starting…/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start session/i })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();

  await page.getByRole('button', { name: /Cancel/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => previewTarget).toBe('/v1/sessions/sess_mock/stop');
});

// ── 4. READY (always_on): Generate enabled, no session chrome ─────────────────
test('always_on model is READY — Generate enabled, no session panel chrome', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        makeGrokProviderResponse({
          models: [
            makeGrokImageModelInfo({
              description: 'Fast model',
              generation_modes: generationModes(['t2i']),
              max_images: 4,
              aspect_ratios: ['1:1'],
              image: null,
            }),
          ],
        }),
      ),
    }),
  );
  await page.route('**/v1/sessions', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [] }),
    }),
  );

  await page.goto('/app/create?prompt=hello');

  // Generate should be enabled (prompt is set via URL param)
  const generateBtn = page.getByRole('button', { name: /Generate/i }).first();
  await expect(generateBtn).toBeEnabled();

  // No "Needs GPU session" or "Start session" chrome
  await expect(page.getByText(/Needs GPU session/i)).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Start session/i })).not.toBeVisible();
});

// ── 5. READY (on_demand active): Stop button visible, Generate enabled ─────────
test('READY (on_demand active session): Stop button visible and Generate enabled', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeAishaProviderResponse({ runtime: makeModelRuntime('active') })),
    }),
  );
  await page.route(
    (url) => url.pathname === '/v1/sessions',
    (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeGpuSessionListResponse([makeSession('active')])),
      }),
  );
  await page.route('**/v1/sessions/*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeSession('active')),
    }),
  );

  await page.goto('/app/create?prompt=hello');

  await expect(page.getByText(/Session active/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Stop session/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeEnabled();
});

// ── 6. STALE: Stop button visible, Generate disabled ─────────────────────────
test('STALE session: Stop button visible and Generate disabled', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeAishaProviderResponse({ runtime: makeModelRuntime('stale') })),
    }),
  );
  await page.route('**/v1/sessions', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeGpuSessionListResponse([makeSession('stale')])),
    }),
  );
  await page.route('**/v1/sessions/*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeSession('stale')),
    }),
  );

  await page.goto('/app/create?prompt=hello');

  await expect(page.getByText(/Session unreachable/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Stop session/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();
});

// ── 7. Stop → StopSessionModal preview → confirm ─────────────────────────────
test('Stop button opens StopSessionModal; confirm calls stop endpoint', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeAishaProviderResponse({ runtime: makeModelRuntime('active') })),
    }),
  );
  await page.route(
    (url) => url.pathname === '/v1/sessions',
    async (r) => {
      if (r.request().method() === 'GET') {
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeGpuSessionListResponse([makeSession('active')])),
        });
      }
    },
  );
  await page.route('**/v1/sessions/*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeSession('active')),
    }),
  );
  await page.route('**/v1/sessions/*/stop', async (r) => {
    const body = (await r.request().postDataJSON()) as { confirmed: boolean };
    if (!body.confirmed) {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeStopConfirmationResponse()),
      });
    } else {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeSession('stopping')),
      });
    }
  });

  await page.goto('/app/create');

  await expect(page.getByRole('button', { name: /Stop session/i })).toBeVisible();
  await page.getByRole('button', { name: /Stop session/i }).click();

  // Modal should appear
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('500')).toBeVisible();

  // Confirm stop
  await page
    .getByRole('button', { name: /Stop Session/i })
    .last()
    .click();
  // Modal closes
  await expect(page.getByText(/Estimated final tokens/i)).not.toBeVisible({ timeout: 3000 });
});
