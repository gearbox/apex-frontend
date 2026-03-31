import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const mockProvidersResponse = {
  providers: [
    {
      provider: 'aisha',
      name: 'Aisha',
      available: true,
      models: [
        {
          model_key: 'aisha-image',
          name: 'Aisha',
          description: 'Fast image model',
          capabilities: ['t2i', 'i2i'],
          is_enabled: true,
          max_images: 4,
          max_prompt_length: 4096,
          supports_negative_prompt: true,
          aspect_ratios: ['1:1', '16:9'],
          image: null,
          video: null,
        },
      ],
    },
  ],
  user_context: null,
};

const mockGenerateResponse = {
  job_id: 'job_e2e_001',
  status: 'pending',
  name: 'E2E generation',
  model: 'aisha-image',
  generation_type: 't2i',
  created_at: '2025-01-01T00:00:00Z',
};

test.describe('Generate page', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/providers', jsonRoute(mockProvidersResponse));
    await page.route('**/v1/billing/pricing', jsonRoute([]));
  });

  test('1. Form renders with correct elements', async ({ authenticatedPage: page }) => {
    await page.goto('/app/create');

    await expect(page.getByRole('button', { name: /Generate/i })).toBeVisible();
  });

  test('2. Generate button disabled without prompt', async ({ authenticatedPage: page }) => {
    await page.goto('/app/create');

    const generateBtn = page.getByRole('button', { name: /Generate/i });
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeDisabled();
  });

  test('3. Job submission shows loading state', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/generate', async (route) => {
      const headers = route.request().headers();
      if (!headers['idempotency-key']) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'validation_error',
            message: 'Missing Idempotency-Key',
            status_code: 400,
          }),
        });
      }
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockGenerateResponse),
      });
    });
    await page.route('**/v1/jobs/**', jsonRoute({
      id: 'job_e2e_001',
      status: 'running',
      name: 'E2E generation',
      provider: 'aisha',
      model: 'aisha-image',
      generation_type: 't2i',
      prompt: 'A beautiful test image',
      created_at: '2025-01-01T00:00:00Z',
      outputs: [],
    }));

    // Navigate with ?prompt= pre-populated — avoids synthetic input event issues
    // in Svelte 5 production builds where CDP key events don't trigger oninput handlers.
    await page.goto('/app/create?prompt=A+beautiful+test+image');

    // Wait for the first visible Generate button (there are two in DOM: desktop inline + mobile sticky)
    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // Should show generating/submitting state
    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();
  });

  test('4. Mobile layout: sticky Generate button is present at 375px', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/app/create');

    // On mobile the button is in the sticky bar (fixed bottom)
    const generateBtn = page.getByRole('button', { name: /Generate/i });
    await expect(generateBtn).toBeVisible();
  });
});
