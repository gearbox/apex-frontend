import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockProviders = {
  providers: [
    {
      provider: 'aisha',
      name: 'Aisha',
      available: true,
      provisioning_mode: 'on_demand',
      models: [
        {
          model_key: 'aisha-image',
          name: 'Aisha',
          capabilities: ['t2i', 'i2i'],
          is_enabled: true,
          max_images: 4,
          max_prompt_length: 4096,
          supports_negative_prompt: true,
          aspect_ratios: ['1:1'],
          image: null,
          video: null,
          session_state: 'none',
        },
      ],
    },
  ],
  user_context: null,
};

const mockProvisioningSession = {
  id: 'sess_prov',
  user_id: 'usr_001',
  product_id: 'prod_001',
  status: 'provisioning',
  model_type: 'aisha-image',
  bundle_name: 'aisha-bundle',
  bundle_version: '1.0.0',
  tunnel_hostname: null,
  vastai_gpu_name: null,
  vastai_cost_per_hour_micros: 50000,
  created_at: '2026-06-20T00:00:00Z',
  started_at: null,
  paused_at: null,
  resumed_at: null,
  stopped_at: null,
  error_message: null,
  in_flight_job_count: 0,
  provisioning_phase: 'downloading',
  provisioning_progress: null,
};

const mockActiveSession = {
  ...mockProvisioningSession,
  id: 'sess_active',
  status: 'active',
  tunnel_hostname: 'tunnel.example.com',
  vastai_gpu_name: 'RTX 4090',
  started_at: '2026-06-20T00:01:00Z',
  provisioning_phase: null,
};

const mockStopPreview = {
  session_id: 'sess_active',
  model_type: 'aisha-image',
  bundle_name: 'aisha-bundle',
  vastai_gpu_name: 'RTX 4090',
  vastai_cost_per_hour_micros: 50000,
  active_duration_seconds: 3600,
  paused_duration_seconds: 0,
  estimated_final_tokens: 500,
  message: 'This will stop your session.',
};

// Helper: route handler that dispatches on pathname + method
function makeSessionRouter(opts: {
  sessions?: (typeof mockActiveSession)[];
  onStart?: () => object;
  stopPreview?: object;
}) {
  return async (route: import('@playwright/test').Route) => {
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
      body: JSON.stringify({ sessions: list }),
    });
  };
}

// ── beforeEach shared setup ───────────────────────────────────────────────────

async function setupCommon(page: import('@playwright/test').Page) {
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

  test('2. Start session → provisioning → shows progress bar', async ({
    authenticatedPage: page,
  }) => {
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
          body: JSON.stringify({ sessions }),
        });
      },
    );

    await page.goto('/app/sessions');
    await expect(page.getByRole('button', { name: 'Start Session' })).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole('button', { name: 'Start Session' }).click();

    // Progress bar (.progress-wrap has role="progressbar") appears for provisioning sessions
    await expect(page.getByRole('progressbar')).toBeVisible({ timeout: 8000 });
  });

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

  test('6. Unavailable provider → Start button disabled', async ({ authenticatedPage: page }) => {
    const unavailableProviders = {
      providers: [{ ...mockProviders.providers[0], available: false }],
      user_context: null,
    };
    await page.route((url) => url.pathname === '/v1/providers', jsonRoute(unavailableProviders));
    await page.route((url) => url.pathname.startsWith('/v1/sessions'), jsonRoute({ sessions: [] }));

    await page.goto('/app/sessions');

    const startBtn = page.getByRole('button', { name: 'Start Session' });
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await expect(startBtn).toBeDisabled();
  });
});

// ── Create page hook tests ────────────────────────────────────────────────────

test.describe('Sessions page — create page hook', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await setupCommon(page);
  });

  test('7. On-demand model without active session disables Generate and shows session link', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');

    // Click "Aisha" button in ModelSelector to switch to the on-demand model
    // (default store model is grok-imagine-image; we need aisha-image for needsSession=true)
    await expect(page.getByRole('button', { name: 'Aisha' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Aisha' }).click();

    // Session notice and link should appear
    const sessionLink = page.getByRole('link', { name: /Start a session/i });
    await expect(sessionLink).toBeVisible({ timeout: 3000 });

    // Generate button(s) should be disabled
    const generateBtns = page.getByRole('button', { name: /Generate/i });
    await expect(generateBtns.first()).toBeDisabled();
  });

  test('8. 409 no_active_gpu_session on generate shows action toast', async ({
    authenticatedPage: page,
  }) => {
    // Provider with aisha active session (so needsSession = false → Generate enabled)
    const activeSessionProviders = {
      providers: [
        {
          ...mockProviders.providers[0],
          models: [{ ...mockProviders.providers[0].models[0], session_state: 'active' }],
        },
      ],
      user_context: null,
    };
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

    // Toast message mentions GPU session
    await expect(page.getByText(/GPU session/i)).toBeVisible({ timeout: 5000 });
  });
});
