import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const mockUploads = {
  items: [
    {
      id: 'upload_001',
      filename: 'photo.jpg',
      content_type: 'image/jpeg',
      size_bytes: 500000,
      created_at: '2025-06-01T00:00:00Z',
      expires_at: '2025-07-01T00:00:00Z',
    },
    {
      id: 'upload_002',
      filename: 'sketch.png',
      content_type: 'image/png',
      size_bytes: 300000,
      created_at: '2025-06-02T00:00:00Z',
      expires_at: '2025-07-02T00:00:00Z',
    },
  ],
  limit: 30,
  has_more: false,
  next_cursor: null,
};

const mockGalleryImages = {
  items: [
    {
      job_id: 'job_gen_001',
      cover_url: '/v1/content/outputs/out_001',
      video_url: null,
      badge: 'prompt',
      media_type: 'image',
      output_count: 1,
      generation_type: 't2i',
      model: 'grok-imagine-image',
      aspect_ratio: '1:1',
      prompt_snippet: 'A sunset over mountains',
      created_at: '2025-06-03T00:00:00Z',
    },
    {
      // i2i job — backend returns source image as cover_url
      job_id: 'job_i2i_001',
      cover_url: '/v1/content/uploads/upload_src_001',
      video_url: null,
      badge: 'image',
      media_type: 'image',
      output_count: 1,
      generation_type: 'i2i',
      model: 'grok-imagine-image',
      aspect_ratio: '1:1',
      prompt_snippet: 'Stylised portrait',
      created_at: '2025-06-04T00:00:00Z',
    },
  ],
  limit: 20,
  has_more: false,
  next_cursor: null,
};

const mockGalleryDetailI2i = {
  job_id: 'job_i2i_001',
  badge: 'image',
  input_image_url: '/v1/content/uploads/upload_src_001',
  prompt: 'Stylised portrait in oil painting style',
  negative_prompt: null,
  outputs: [
    {
      id: 'out_i2i_001',
      url: '/v1/content/outputs/out_i2i_001',
      thumbnail_url: null,
      content_type: 'image/jpeg',
      media_type: 'image',
      format: 'jpeg',
      size_bytes: 204800,
      output_index: 0,
      created_at: '2025-06-04T00:01:00Z',
    },
  ],
  media_type: 'image',
  model: 'grok-imagine-image',
  provider: 'grok',
  generation_type: 'i2i',
  aspect_ratio: '1:1',
  token_cost: 15,
  created_at: '2025-06-04T00:00:00Z',
  completed_at: '2025-06-04T00:01:00Z',
  lineage: {
    source_type: 'upload',
    source_upload_id: 'upload_src_001',
    source_job_id: null,
    source_job_name: null,
    source_output_id: null,
  },
};

const mockGalleryDetail = {
  job_id: 'job_gen_001',
  badge: 'prompt',
  input_image_url: null,
  prompt: 'A sunset over mountains with golden light streaming through clouds',
  negative_prompt: null,
  outputs: [
    {
      id: 'out_001',
      url: '/v1/content/outputs/out_001',
      thumbnail_url: null,
      content_type: 'image/jpeg',
      media_type: 'image',
      format: 'jpeg',
      size_bytes: 102400,
      output_index: 0,
      created_at: '2025-06-03T00:01:00Z',
    },
  ],
  media_type: 'image',
  model: 'grok-imagine-image',
  provider: 'grok',
  generation_type: 't2i',
  aspect_ratio: '1:1',
  token_cost: 10,
  created_at: '2025-06-03T00:00:00Z',
  completed_at: '2025-06-03T00:01:00Z',
  lineage: null,
};

test.describe('Image Picker', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/storage/uploads*', jsonRoute(mockUploads));
    await page.route('**/v1/gallery*media_type=image*', jsonRoute(mockGalleryImages));
    await page.route('**/v1/gallery/job_gen_001', jsonRoute(mockGalleryDetail));
    await page.route('**/v1/gallery/job_i2i_001', jsonRoute(mockGalleryDetailI2i));
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake') }),
    );
    await page.route(
      '**/v1/providers',
      jsonRoute({
        providers: [
          {
            provider: 'grok',
            name: 'xAI Grok',
            available: true,
            models: [
              {
                model_key: 'grok-imagine-image',
                name: 'Grok Imagine',
                capabilities: ['t2i', 'i2i'],
                is_enabled: true,
                max_images: 10,
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
      }),
    );
    await page.route(
      '**/v1/billing/balance',
      jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 1000 }),
    );
    await page.route('**/v1/billing/pricing', jsonRoute([]));
  });

  test('1. "Choose from library" button appears in I2I mode', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');

    // Switch to I2I mode
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await expect(page.getByRole('button', { name: /Choose from library/i })).toBeVisible();
  });

  test('2. "Choose from library" is NOT visible in T2I mode', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');
    await expect(page.getByRole('button', { name: /Choose from library/i })).not.toBeVisible();
  });

  test('3. Picker opens and shows uploads tab', async ({ authenticatedPage: page }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();

    await expect(page.getByRole('heading', { name: 'Choose from Library' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Uploads/i })).toBeVisible();
  });

  test('4. Can switch to Generated tab', async ({ authenticatedPage: page }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();
    await page.getByRole('tab', { name: /Generated/i }).click();

    // Should show generated items (the gallery query fires)
    await expect(page.getByText('A sunset over mountains')).toBeVisible({ timeout: 5000 });
  });

  test('5. Selecting an upload and confirming updates the preview', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();

    // Wait for uploads to load then click first thumbnail
    await page.waitForTimeout(500);
    await page.locator('[aria-pressed]').first().click();

    const confirmBtn = page.getByRole('button', { name: /Use Selected Image/i });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Modal should close
    await expect(page.getByRole('heading', { name: 'Choose from Library' })).not.toBeVisible();

    // Preview should show "From uploads"
    await expect(page.getByText('From uploads')).toBeVisible();
  });

  test('6. Selecting a generated output auto-fills prompt', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();
    await page.getByRole('tab', { name: /Generated/i }).click();

    await page.waitForTimeout(500);
    await page.locator('[aria-pressed]').first().click();
    await page.getByRole('button', { name: /Use Selected Image/i }).click();

    // Prompt should be auto-filled with the full prompt from gallery detail
    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toHaveValue(/sunset over mountains/i, { timeout: 3000 });
  });

  test('7. Escape closes the picker', async ({ authenticatedPage: page }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();
    await expect(page.getByRole('heading', { name: 'Choose from Library' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Choose from Library' })).not.toBeVisible();
  });

  test('8. Selecting an i2i generated item uses the output URL (not the source cover_url) for the preview', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();
    await page.getByRole('tab', { name: /Generated/i }).click();

    // Select the i2i item (second item in the grid)
    await page.waitForTimeout(500);
    const items = page.locator('[aria-pressed]');
    await items.nth(1).click(); // second item is the i2i job
    await page.getByRole('button', { name: /Use Selected Image/i }).click();

    // Prompt should be auto-filled from the i2i detail (not cover_url source image)
    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toHaveValue(/oil painting/i, { timeout: 3000 });

    // Preview should show "From generated"
    await expect(page.getByText('From generated')).toBeVisible();
  });

  test('9. i2i items in the Generated tab are labelled as source', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();
    await page.getByRole('tab', { name: /Generated/i }).click();

    await expect(page.getByText('source')).toBeVisible({ timeout: 5000 });
  });

  test('10. Clearing the selection resets the preview', async ({ authenticatedPage: page }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    // Select from picker
    await page.getByRole('button', { name: /Choose from library/i }).click();
    await page.waitForTimeout(500);
    await page.locator('[aria-pressed]').first().click();
    await page.getByRole('button', { name: /Use Selected Image/i }).click();

    await expect(page.getByText('From uploads')).toBeVisible();

    // Clear the selection
    await page.getByRole('button', { name: /Remove image/i }).click();

    // Should show the drag-drop zone and library button again
    await expect(page.getByText(/Drop image here/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Choose from library/i })).toBeVisible();
  });
});
