import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const AISHA_IMAGE_CONSTRAINTS = {
  min_height: 256,
  max_height: 2048,
  default_height: 1024,
  output_resolutions: null,
  supported_tiers: ['draft', 'standard', 'high', 'ultra'],
  default_tier: 'standard',
  tier_megapixels: { draft: 0.25, standard: 1.0, high: 2.0, ultra: 4.0 },
};

// Aisha always_on + image constraints (generates without a GPU session)
const aishaProvidersResponse = {
  providers: [
    {
      provider: 'aisha',
      name: 'Aisha',
      available: true,
      provisioning_mode: 'always_on',
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
          image: AISHA_IMAGE_CONSTRAINTS,
          video: null,
        },
      ],
    },
  ],
  user_context: null,
};

// Grok-only provider (no negative prompt, no Aisha params)
const grokProvidersResponse = {
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
          description: 'Fast image generation model',
          capabilities: ['t2i', 'i2i'],
          is_enabled: true,
          max_images: 4,
          max_prompt_length: 4096,
          supports_negative_prompt: false,
          aspect_ratios: ['1:1', '16:9', '9:16'],
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
    // Use old mock with image: null so existing tests are unaffected
    await page.route(
      '**/v1/providers',
      jsonRoute({
        providers: [
          {
            provider: 'aisha',
            name: 'Aisha',
            available: true,
            provisioning_mode: 'always_on',
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
      }),
    );
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
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_001',
        status: 'running',
        name: 'E2E generation',
        provider: 'aisha',
        model: 'aisha-image',
        generation_type: 't2i',
        prompt: 'A beautiful test image',
        created_at: '2025-01-01T00:00:00Z',
        outputs: [],
      }),
    );

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

  test('4. Mobile layout: sticky Generate button is present at 375px', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/app/create');

    // On mobile the button is in the sticky bar (fixed bottom)
    const generateBtn = page.getByRole('button', { name: /Generate/i });
    await expect(generateBtn).toBeVisible();
  });
});

test.describe('Aisha image advanced params', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/providers', jsonRoute(aishaProvidersResponse));
    await page.route('**/v1/billing/pricing', jsonRoute([]));
  });

  test('5. Tier selection: submits image_resolution and negative_prompt, no width/height', async ({
    authenticatedPage: page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('**/v1/generate', async (route) => {
      capturedBody = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockGenerateResponse, model: 'aisha-image' }),
      });
    });
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_001',
        status: 'running',
        name: 'test',
        provider: 'aisha',
        model: 'aisha-image',
        generation_type: 't2i',
        prompt: 'test',
        created_at: '2025-01-01T00:00:00Z',
        outputs: [],
      }),
    );

    await page.goto('/app/create?prompt=test+image');

    // Click the 'high' tier chip
    await page.getByRole('button', { name: 'high' }).click();

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['image_resolution']).toBe('high');
    expect(capturedBody!['width']).toBeUndefined();
    expect(capturedBody!['height']).toBeUndefined();
    expect(capturedBody!['negative_prompt']).toBeTruthy();
  });

  test('6. Custom size: submits width+height, no image_resolution', async ({
    authenticatedPage: page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('**/v1/generate', async (route) => {
      capturedBody = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockGenerateResponse, model: 'aisha-image' }),
      });
    });
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_001',
        status: 'running',
        name: 'test',
        provider: 'aisha',
        model: 'aisha-image',
        generation_type: 't2i',
        prompt: 'test',
        created_at: '2025-01-01T00:00:00Z',
        outputs: [],
      }),
    );

    await page.goto('/app/create?prompt=test+image');

    // Switch to custom size mode
    await page.getByRole('button', { name: 'Custom Size' }).click();

    // Fill in width and height
    await page.getByLabel('Width').fill('1280');
    await page.getByLabel('Height').fill('720');

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['width']).toBe(1280);
    expect(capturedBody!['height']).toBe(720);
    expect(capturedBody!['image_resolution']).toBeUndefined();
  });

  test('7. Sampler override: sampler appears in body; other Auto fields absent', async ({
    authenticatedPage: page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('**/v1/generate', async (route) => {
      capturedBody = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockGenerateResponse, model: 'aisha-image' }),
      });
    });
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_001',
        status: 'running',
        name: 'test',
        provider: 'aisha',
        model: 'aisha-image',
        generation_type: 't2i',
        prompt: 'test',
        created_at: '2025-01-01T00:00:00Z',
        outputs: [],
      }),
    );

    await page.goto('/app/create?prompt=test+image');

    // Open the Advanced disclosure
    await page.getByRole('button', { name: 'Advanced' }).click();

    // Change sampler to 'euler' (leave others as Auto)
    await page.getByLabel('Sampler').selectOption('euler');

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['sampler']).toBe('euler');
    expect(capturedBody!['scheduler']).toBeUndefined();
    expect(capturedBody!['seed']).toBeUndefined();
    expect(capturedBody!['steps']).toBeUndefined();
    expect(capturedBody!['cfg']).toBeUndefined();
    expect(capturedBody!['denoise']).toBeUndefined();
  });
});

test.describe('Grok model — negative_prompt and Aisha params gating', () => {
  test('8. Grok: no negative_prompt field visible, body has no negative_prompt or Aisha params', async ({
    authenticatedPage: page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('**/v1/providers', jsonRoute(grokProvidersResponse));
    await page.route('**/v1/billing/pricing', jsonRoute([]));
    await page.route('**/v1/generate', async (route) => {
      capturedBody = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockGenerateResponse, model: 'grok-imagine-image' }),
      });
    });
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_001',
        status: 'running',
        name: 'test',
        provider: 'grok',
        model: 'grok-imagine-image',
        generation_type: 't2i',
        prompt: 'test',
        created_at: '2025-01-01T00:00:00Z',
        outputs: [],
      }),
    );

    await page.goto('/app/create?prompt=test+image');

    // Negative prompt field should NOT be visible
    await expect(page.getByRole('button', { name: /Negative Prompt/i })).not.toBeVisible();

    // Aisha advanced params should NOT be visible
    await expect(page.getByRole('button', { name: 'Quality Tier' })).not.toBeVisible();

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['negative_prompt']).toBeUndefined();
    expect(capturedBody!['image_resolution']).toBeUndefined();
    expect(capturedBody!['width']).toBeUndefined();
    expect(capturedBody!['height']).toBeUndefined();
    expect(capturedBody!['seed']).toBeUndefined();
    expect(capturedBody!['sampler']).toBeUndefined();
    expect(capturedBody!['scheduler']).toBeUndefined();
  });
});
