import { Buffer } from 'node:buffer';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

function makeMedia(url: string, mediaType: 'image' | 'video' = 'image') {
  return {
    media_type: mediaType,
    original: {
      url,
      width: 1024,
      height: 768,
      content_type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      size_bytes: 500000,
    },
    variants: [],
  };
}

function makeUploadItem(overrides: Record<string, unknown> = {}) {
  return {
    asset_ref: 'upload:b0000000-0000-4000-8000-000000000001',
    source: 'upload',
    media: makeMedia('/v1/content/uploads/b0000000-0000-4000-8000-000000000001'),
    created_at: '2025-06-01T00:00:00Z',
    expires_at: '2025-07-01T00:00:00Z',
    display_title: null,
    original_filename: 'photo.jpg',
    is_favorite: false,
    duration_ms: null,
    job_id: null,
    output_count: null,
    model: null,
    generation_type: null,
    available_actions: ['download', 'favorite', 'delete'],
    ...overrides,
  };
}

function makeOutputItem(overrides: Record<string, unknown> = {}) {
  return {
    asset_ref: 'output:a0000000-0000-4000-8000-000000000001',
    source: 'output',
    media: makeMedia('/v1/content/outputs/a0000000-0000-4000-8000-000000000001'),
    created_at: '2025-06-03T00:00:00Z',
    expires_at: '2025-07-03T00:00:00Z',
    display_title: null,
    original_filename: null,
    is_favorite: false,
    duration_ms: null,
    job_id: 'job_gen_001',
    output_count: 1,
    model: 'grok-imagine-image',
    generation_type: 't2i',
    available_actions: ['remix', 'download', 'favorite', 'delete'],
    ...overrides,
  };
}

const mockUploadItems = [
  makeUploadItem({
    asset_ref: 'upload:b0000000-0000-4000-8000-000000000001',
    original_filename: 'photo.jpg',
    media: makeMedia('/v1/content/uploads/b0000000-0000-4000-8000-000000000001'),
  }),
  makeUploadItem({
    asset_ref: 'upload:b0000000-0000-4000-8000-000000000002',
    original_filename: 'sketch.png',
    media: makeMedia('/v1/content/uploads/b0000000-0000-4000-8000-000000000002'),
  }),
];

// Only returned when the caller does not filter by media_type=image — used to prove
// the picker's server-side image filter excludes it from the Uploads tab.
const mockUploadVideoItem = makeUploadItem({
  asset_ref: 'upload:b0000000-0000-4000-8000-000000000003',
  original_filename: 'clip.mp4',
  media: makeMedia('/v1/content/uploads/b0000000-0000-4000-8000-000000000003', 'video'),
  duration_ms: 4000,
});

const mockGeneratedItems = [
  makeOutputItem({
    asset_ref: 'output:a0000000-0000-4000-8000-000000000001',
    job_id: 'job_gen_001',
    media: makeMedia('/v1/content/outputs/a0000000-0000-4000-8000-000000000001'),
  }),
  makeOutputItem({
    asset_ref: 'output:a0000000-0000-4000-8000-00000000000c',
    job_id: 'job_i2i_001',
    generation_type: 'i2i',
    media: makeMedia('/v1/content/outputs/a0000000-0000-4000-8000-00000000000c'),
  }),
];

const mockAssetDetailT2i = {
  ...mockGeneratedItems[0],
  prompt: 'A sunset over mountains with golden light streaming through clouds',
  negative_prompt: null,
  provider: 'grok',
  aspect_ratio: '1:1',
  token_cost: 10,
  completed_at: '2025-06-03T00:01:00Z',
  lineage: null,
  descendants: { job_count: 0, frame_count: 0 },
};

const mockAssetDetailI2i = {
  ...mockGeneratedItems[1],
  prompt: 'Stylised portrait in oil painting style',
  negative_prompt: null,
  provider: 'grok',
  aspect_ratio: '1:1',
  token_cost: 15,
  completed_at: '2025-06-04T00:01:00Z',
  lineage: {
    source_asset_ref: 'upload:b0000000-0000-4000-8000-000000000099',
    source_job_id: null,
    source_timestamp_ms: null,
  },
  descendants: { job_count: 0, frame_count: 0 },
};

test.describe('Image Picker', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/library*', (route) => {
      const url = new URL(route.request().url());
      const source = url.searchParams.get('source');
      const mediaType = url.searchParams.get('media_type');

      const pool =
        source === 'upload' ? [...mockUploadItems, mockUploadVideoItem] : mockGeneratedItems;
      const items = mediaType ? pool.filter((item) => item.media.media_type === mediaType) : pool;

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, limit: 30, has_more: false, next_cursor: null }),
      });
    });
    // openapi-fetch URL-encodes the ":" in the asset_ref path param, so match
    // loosely and dispatch on the decoded URL instead of the raw glob suffix.
    await page.route('**/v1/library/assets/**', (route) => {
      const url = decodeURIComponent(route.request().url());
      if (url.endsWith('output:a0000000-0000-4000-8000-00000000000c'))
        return jsonRoute(mockAssetDetailI2i)(route);
      return jsonRoute(mockAssetDetailT2i)(route);
    });
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

    // Should show generated items (the library query fires with source=output)
    await expect(page.locator('[aria-pressed]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[aria-pressed]')).toHaveCount(2);
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

  test('uploads tab excludes videos from source-image selection', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();
    await page.getByRole('button', { name: /Choose from library/i }).click();

    await expect(page.getByRole('button', { name: 'Upload: photo.jpg' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload: clip.mp4' })).not.toBeVisible();
  });

  test('6. Selecting a generated output auto-fills prompt', async ({ authenticatedPage: page }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();
    await page.getByRole('tab', { name: /Generated/i }).click();

    await page.waitForTimeout(500);
    await page.locator('[aria-pressed]').first().click();
    await page.getByRole('button', { name: /Use Selected Image/i }).click();

    // Prompt should be auto-filled with the full prompt from the asset detail
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

  test("8. Selecting the second generated item auto-fills its own prompt (not the first item's)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/app/create');
    await page.getByRole('button', { name: 'Image → Image' }).click();

    await page.getByRole('button', { name: /Choose from library/i }).click();
    await page.getByRole('tab', { name: /Generated/i }).click();

    // Select the i2i item (second item in the grid)
    await page.waitForTimeout(500);
    const items = page.locator('[aria-pressed]');
    await items.nth(1).click();
    await page.getByRole('button', { name: /Use Selected Image/i }).click();

    // Prompt should be auto-filled from the i2i asset's own detail
    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toHaveValue(/oil painting/i, { timeout: 3000 });

    // Preview should show "From generated"
    await expect(page.getByText('From generated')).toBeVisible();
  });

  test('9. Clearing the selection resets the preview', async ({ authenticatedPage: page }) => {
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
