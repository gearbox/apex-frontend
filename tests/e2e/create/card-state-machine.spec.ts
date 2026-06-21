import { test, expect } from '../fixtures/auth.fixture';
import { test as anonTest, type Page } from '@playwright/test';

// Shared providers helper
function makeAishaProvider(session_state: string, available = true) {
  return {
    providers: [
      {
        provider: 'aisha',
        name: 'Aisha',
        available,
        provisioning_mode: 'on_demand',
        models: [
          {
            model_key: 'aisha-image',
            name: 'Aisha',
            description: 'Aisha image model',
            capabilities: ['t2i', 'i2i'],
            is_enabled: true,
            max_images: 4,
            max_prompt_length: 4096,
            supports_negative_prompt: true,
            aspect_ratios: ['1:1'],
            image: null,
            video: null,
            session_state,
          },
        ],
      },
    ],
    user_context: null,
  };
}

const makeSession = (status: string, id = 'sess_mock') => ({
  id,
  user_id: 'usr_001',
  product_id: 'prod_001',
  status,
  model_type: 'aisha-image',
  bundle_name: 'aisha-bundle',
  bundle_version: '1.0.0',
  tunnel_hostname: status === 'active' ? 'tunnel.example.com' : null,
  vastai_gpu_name: 'RTX 4090',
  vastai_cost_per_hour_micros: 50000,
  created_at: '2026-06-20T00:00:00Z',
  started_at: status === 'active' ? '2026-06-20T00:01:00Z' : null,
  paused_at: null,
  resumed_at: null,
  stopped_at: null,
  error_message: null,
  in_flight_job_count: 0,
  provisioning_phase: null,
  provisioning_progress: null,
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
anonTest('Anonymous user is redirected to /login for an on_demand create route', async ({ page }) => {
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
      body: JSON.stringify(makeAishaProvider('none')),
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
});

// ── 2. Unavailable: on_demand available:false → UNAVAILABLE, no Start ─────────
test('Unavailable model shows no Start CTA (finding-#3 regression guard)', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeAishaProvider('none', false)),
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

  let sessionState = 'none';
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeAishaProvider(sessionState as never)),
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
          body: JSON.stringify({
            sessions: sessionState === 'none' ? [] : [makeSession('provisioning')],
          }),
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

// ── 4. READY (always_on): Generate enabled, no session chrome ─────────────────
test('always_on model is READY — Generate enabled, no session panel chrome', async ({
  authenticatedPage: page,
}) => {
  await setupCommonRoutes(page);
  await page.route('**/v1/providers', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: [
          {
            provider: 'grok',
            name: 'xAI Grok',
            available: true,
            provisioning_mode: 'always_on',
            models: [
              {
                model_key: 'grok-imagine-image',
                name: 'Grok Imagine',
                description: 'Fast model',
                capabilities: ['t2i'],
                is_enabled: true,
                max_images: 4,
                max_prompt_length: 4096,
                supports_negative_prompt: false,
                aspect_ratios: ['1:1'],
                image: null,
                video: null,
              },
            ],
          },
        ],
        user_context: null,
      }),
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
      body: JSON.stringify(makeAishaProvider('active')),
    }),
  );
  await page.route(
    (url) => url.pathname === '/v1/sessions',
    (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [makeSession('active')] }),
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
      body: JSON.stringify(makeAishaProvider('stale')),
    }),
  );
  await page.route('**/v1/sessions', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [makeSession('stale')] }),
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
      body: JSON.stringify(makeAishaProvider('active')),
    }),
  );
  await page.route(
    (url) => url.pathname === '/v1/sessions',
    async (r) => {
      if (r.request().method() === 'GET') {
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sessions: [makeSession('active')] }),
        });
      }
    },
  );
  await page.route('**/v1/sessions/*/stop', async (r) => {
    const body = (await r.request().postDataJSON()) as { confirmed: boolean };
    if (!body.confirmed) {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: 'sess_mock',
          model_type: 'aisha-image',
          bundle_name: 'aisha-bundle',
          vastai_gpu_name: 'RTX 4090',
          vastai_cost_per_hour_micros: 50000,
          active_duration_seconds: 3600,
          paused_duration_seconds: 0,
          estimated_final_tokens: 500,
          message: 'Stopping this session will finalize billing.',
        }),
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
