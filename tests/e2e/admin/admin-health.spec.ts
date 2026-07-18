import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const adminProfile = {
  id: 'usr_e2e_001',
  email: 'e2e@example.com',
  display_name: 'E2E Admin',
  role: 'admin',
  subscription_tier: 'free',
  email_verified: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const mockHealth = {
  status: 'degraded',
  checked_at: '2026-06-22T12:00:00Z',
  infrastructure: {
    status: 'healthy',
    components: [
      { name: 'database', status: 'healthy', latency_ms: 5, message: '' },
      { name: 'redis', status: 'healthy', latency_ms: 2, message: '' },
    ],
  },
  platform_apis: {
    status: 'degraded',
    components: [
      { name: 'stripe', status: 'healthy', latency_ms: 110, message: '' },
      { name: 'openai', status: 'degraded', latency_ms: 520, message: 'Elevated latency' },
    ],
  },
  cloud_providers: {
    vex: {
      status: 'healthy',
      components: [{ name: 'grok-imagine', status: 'healthy', latency_ms: 80, message: '' }],
    },
  },
  gpu_sessions: {
    status: 'healthy',
    total: 4,
    healthy: 3,
    stale: 1,
    message: '',
  },
};

const now = Date.now();
const mockHistory = Array.from({ length: 30 }, (_, i) => ({
  checked_at: new Date(now - (30 - i) * 60_000).toISOString(),
  overall_status: i % 5 === 0 ? 'degraded' : 'healthy',
  snapshot_data: {},
}));

test.describe('Admin Health Dashboard', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Abort the stream so the tab falls back to polling (deterministic)
    await page.route('**/v1/admin/health/stream', (route) => route.abort());
    await page.route('**/v1/users/me', jsonRoute(adminProfile));
    await page.route('**/v1/admin/health', jsonRoute(mockHealth));
    await page.route('**/v1/admin/health/history**', jsonRoute(mockHistory));
  });

  test('opens the Health tab and shows overall status badge', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/admin');

    // Navigate to Health tab
    await page.getByRole('tab', { name: /health/i }).click();

    // Overall degraded badge should appear
    await expect(page.getByText('degraded').first()).toBeVisible();
  });

  test('shows infrastructure components', async ({ authenticatedPage: page }) => {
    await page.goto('/app/admin');
    await page.getByRole('tab', { name: /health/i }).click();

    await expect(page.getByText('database')).toBeVisible();
    await expect(page.getByText('redis')).toBeVisible();
  });

  test('shows gpu_sessions counts', async ({ authenticatedPage: page }) => {
    await page.goto('/app/admin');
    await page.getByRole('tab', { name: /health/i }).click();

    const gpuSection = page.getByTestId('category-gpu-sessions');
    await expect(gpuSection).toBeVisible();
    await expect(gpuSection.getByText('3')).toBeVisible();
    await expect(gpuSection.getByText('1')).toBeVisible();
    await expect(gpuSection.getByText('4')).toBeVisible();
  });

  test('renders the history timeline with multiple segments', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/admin');
    await page.getByRole('tab', { name: /health/i }).click();

    // Timeline SVG should be present with rect segments
    const svg = page.locator('svg[role="img"]');
    await expect(svg).toBeVisible();
    const rects = svg.locator('rect');
    await expect(rects).toHaveCount(30);
  });

  test('shows polling indicator when stream is aborted', async ({ authenticatedPage: page }) => {
    await page.goto('/app/admin');
    await page.getByRole('tab', { name: /health/i }).click();

    // The stream-indicator should be in polling state
    const indicator = page.getByTestId('stream-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText(/polling/i);
  });
});
