import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const mockJob = {
  id: 'job_e2e_001',
  name: 'Sunset mountains',
  status: 'completed',
  provider: 'grok',
  model: 'grok-imagine-image',
  generation_type: 't2i',
  prompt: 'A beautiful sunset over mountains',
  created_at: '2025-01-01T00:00:00Z',
  completed_at: '2025-01-01T00:01:00Z',
  started_at: '2025-01-01T00:00:05Z',
  outputs: [
    {
      id: 'out_001',
      url: 'https://example.com/output-1.jpg',
      content_type: 'image/jpeg',
      format: 'jpeg',
      size_bytes: 102400,
      output_index: 0,
      is_thumbnail: false,
    },
  ],
  token_cost: 10,
};

const mockListResponse = { items: [mockJob], total: 1, limit: 20, offset: 0 };

// Use URL predicate to match /v1/jobs with any query params (e.g. ?limit=20&offset=0)
const isJobsList = (url: URL) => url.pathname === '/v1/jobs';
const isJobDetail = (id: string) => (url: URL) => url.pathname === `/v1/jobs/${id}`;

test.describe('Jobs list page', () => {
  test('1. Renders job card for completed job', async ({ authenticatedPage: page }) => {
    await page.route(isJobsList, jsonRoute(mockListResponse));
    await page.goto('/app/jobs');

    await expect(page.getByText('Sunset mountains')).toBeVisible({ timeout: 5000 });
    // Target the status badge <span> specifically (not the timing <dt>)
    await expect(page.locator('span').filter({ hasText: /^Completed$/ })).toBeVisible();
  });

  test('2. Empty state is shown when no jobs', async ({ authenticatedPage: page }) => {
    await page.route(isJobsList, jsonRoute({ items: [], total: 0, limit: 20, offset: 0 }));
    await page.goto('/app/jobs');

    await expect(page.getByText('No jobs yet')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /Start generating/i })).toBeVisible();
  });

  test('3. Clicking a job card navigates to detail page', async ({ authenticatedPage: page }) => {
    await page.route(isJobsList, jsonRoute(mockListResponse));
    await page.route(isJobDetail('job_e2e_001'), jsonRoute(mockJob));
    await page.goto('/app/jobs');

    await page.getByText('Sunset mountains').click();
    await expect(page).toHaveURL(/\/app\/jobs\/job_e2e_001/, { timeout: 5000 });
  });
});

test.describe('Job detail page', () => {
  test('4. Detail page renders all sections for a completed job', async ({ authenticatedPage: page }) => {
    await page.route(isJobDetail('job_e2e_001'), jsonRoute(mockJob));
    await page.goto('/app/jobs/job_e2e_001');

    await expect(page.getByText('Sunset mountains')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('A beautiful sunset over mountains')).toBeVisible();
    // Target the status badge <span> specifically (not the timing <dt>)
    await expect(page.locator('span').filter({ hasText: /^Completed$/ })).toBeVisible();
    await expect(page.getByText('10')).toBeVisible(); // token_cost
  });

  test('5. Not-found state for missing job', async ({ authenticatedPage: page }) => {
    await page.route(isJobDetail('missing_job'), (route) =>
      route.fulfill({ status: 404, body: JSON.stringify({ detail: 'Not found' }) }),
    );
    await page.goto('/app/jobs/missing_job');

    await expect(page.getByText('Job not found')).toBeVisible({ timeout: 5000 });
  });

  test('6. "Try again" button pre-fills create page prompt for failed job', async ({ authenticatedPage: page }) => {
    const failedJob = { ...mockJob, status: 'failed', error: 'Provider timeout', outputs: [] };
    await page.route(isJobDetail('job_e2e_001'), jsonRoute(failedJob));
    await page.goto('/app/jobs/job_e2e_001');

    const tryAgainLink = page.getByRole('link', { name: 'Try again' });
    await expect(tryAgainLink).toBeVisible({ timeout: 5000 });
    const href = await tryAgainLink.getAttribute('href');
    expect(href).toContain('/app/create?prompt=');
    expect(href).toContain(encodeURIComponent(mockJob.prompt));
  });
});
