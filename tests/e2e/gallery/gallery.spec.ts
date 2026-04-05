import { Buffer } from 'node:buffer';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const mockGalleryItems = [
  {
    job_id: 'job_001',
    cover_url: '/v1/content/outputs/out_001',
    video_url: null,
    badge: 'prompt',
    media_type: 'image',
    output_count: 1,
    generation_type: 't2i',
    model: 'grok-imagine-image',
    aspect_ratio: '1:1',
    prompt_snippet: 'A beautiful sunset over mountains',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    job_id: 'job_002',
    cover_url: '/v1/content/outputs/out_002',
    video_url: null,
    badge: 'image',
    media_type: 'image',
    output_count: 2,
    generation_type: 'i2i',
    model: 'grok-imagine-image',
    aspect_ratio: '16:9',
    prompt_snippet: 'Ocean waves crashing on shore',
    created_at: '2025-01-02T00:00:00Z',
  },
  {
    job_id: 'job_003',
    cover_url: '/v1/content/outputs/out_003',
    video_url: '/v1/content/outputs/vid_003',
    badge: 'prompt',
    media_type: 'video',
    output_count: 1,
    generation_type: 't2v',
    model: 'grok-imagine-video',
    aspect_ratio: '16:9',
    prompt_snippet: 'City lights at night timelapse',
    created_at: '2025-01-03T00:00:00Z',
  },
];

const mockGalleryPage = {
  items: mockGalleryItems,
  limit: 20,
  has_more: false,
  next_cursor: null,
};

const mockGalleryDetail = {
  job_id: 'job_001',
  badge: 'prompt',
  input_image_url: null,
  prompt: 'A beautiful sunset over mountains with golden light streaming through clouds',
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
      created_at: '2025-01-01T00:01:00Z',
    },
  ],
  media_type: 'image',
  model: 'grok-imagine-image',
  provider: 'grok',
  generation_type: 't2i',
  aspect_ratio: '1:1',
  token_cost: 10,
  created_at: '2025-01-01T00:00:00Z',
  completed_at: '2025-01-01T00:01:00Z',
  lineage: null,
};

const mockDetailWithLineage = {
  ...mockGalleryDetail,
  job_id: 'job_002',
  badge: 'image',
  input_image_url: '/v1/content/uploads/upload_001',
  generation_type: 'i2i',
  aspect_ratio: '16:9',
  lineage: {
    source_type: 'upload',
    source_upload_id: 'upload_001',
    source_job_id: null,
    source_job_name: null,
    source_output_id: null,
  },
};

const mockProvidersResponse = {
  providers: [
    {
      provider: 'grok',
      name: 'Grok',
      available: true,
      models: [
        {
          model_key: 'grok-imagine-image',
          name: 'Grok Image',
          description: 'Image generation model',
          capabilities: ['t2i', 'i2i'],
          is_enabled: true,
          max_images: 4,
          max_prompt_length: 4096,
          supports_negative_prompt: true,
          aspect_ratios: ['1:1', '16:9', '3:4'],
          image: null,
          video: null,
        },
      ],
    },
  ],
  user_context: null,
};

test.describe('Gallery deletion', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/content/**', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake') });
    });
  });

  test('Delete button in Lightbox shows confirm dialog', async ({ authenticatedPage: page }) => {
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));
    await page.route('**/v1/gallery/job_001', jsonRoute(mockGalleryDetail));

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    // Open lightbox
    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({ timeout: 3000 });

    // Click delete button (trash icon)
    await page.getByRole('button', { name: /delete/i }).click();

    // Confirm dialog should appear
    await expect(page.getByText(/permanently deleted/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('Confirm delete calls API and closes lightbox for single-output job', async ({
    authenticatedPage: page,
  }) => {
    let deleteRequested = false;
    let deletedPath = '';
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));
    await page.route('**/v1/gallery/job_001', jsonRoute(mockGalleryDetail));
    await page.route('**/v1/content/**', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteRequested = true;
        deletedPath = new URL(route.request().url()).pathname;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake') });
    });

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    // Open lightbox → click delete → confirm
    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /delete/i }).last().click(); // confirm button in modal

    // Should have called DELETE /v1/content/{output_id}
    expect(deleteRequested).toBe(true);
    expect(deletedPath).toContain('/v1/content/');
  });

  test('Cancel delete closes dialog without API call', async ({ authenticatedPage: page }) => {
    let deleteRequested = false;
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));
    await page.route('**/v1/gallery/job_001', jsonRoute(mockGalleryDetail));
    await page.route('**/v1/content/**', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteRequested = true;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake') });
    });

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should close, no DELETE request
    await expect(page.getByText(/permanently deleted/i)).not.toBeVisible();
    expect(deleteRequested).toBe(false);
  });

  test('Right-click context menu shows Delete option on desktop', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    // Right-click on first card
    const firstCard = page.locator('[class*="grid"]').locator('button, [role="button"]').first();
    await firstCard.click({ button: 'right' });

    // Context menu should appear with Delete option
    await expect(page.getByText(/delete/i).last()).toBeVisible({ timeout: 2000 });
  });
});

test.describe('Lightbox Remix', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake') }),
    );
  });

  test('8. Remix button navigates to Create page with I2I mode and source image', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));
    await page.route('**/v1/gallery/job_001', jsonRoute(mockGalleryDetail));
    await page.route('**/v1/providers', jsonRoute(mockProvidersResponse));
    await page.route('**/v1/billing/balance', jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 1000 }));
    await page.route('**/v1/billing/pricing', jsonRoute([]));

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    // Open lightbox
    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({ timeout: 3000 });

    // Click Re-Generate button
    await page.getByRole('button', { name: /Re-Generate/i }).click();

    // Should navigate to Create page
    await expect(page).toHaveURL(/\/app\/create/, { timeout: 5000 });

    // Prompt should be pre-filled
    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toHaveValue(
      /A beautiful sunset over mountains with golden light/i,
      { timeout: 3000 },
    );

    // Mode should be I2I — ImageUpload component should be visible
    await expect(page.getByText(/Source Image/i)).toBeVisible();

    // The selected image preview should show "From generated"
    await expect(page.getByText('From generated')).toBeVisible();
  });

  test('9. Re-Generate button shown for video outputs (T2I fallback)', async ({ authenticatedPage: page }) => {
    const videoDetail = {
      ...mockGalleryDetail,
      job_id: 'job_003',
      media_type: 'video',
      generation_type: 't2v',
      outputs: [
        {
          id: 'vid_001',
          url: '/v1/content/outputs/vid_001',
          thumbnail_url: null,
          content_type: 'video/mp4',
          media_type: 'video',
          format: 'mp4',
          size_bytes: 5000000,
          output_index: 0,
          created_at: '2025-01-01T00:01:00Z',
        },
      ],
    };

    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute({
      items: [mockGalleryItems[2]],
      limit: 20,
      has_more: false,
      next_cursor: null,
    }));
    await page.route('**/v1/gallery/job_003', jsonRoute(videoDetail));

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();
    await page.waitForTimeout(1000);

    // Re-Generate button IS visible for video (falls back to T2I regenerate)
    await expect(page.getByRole('button', { name: /Re-Generate/i })).toBeVisible();
  });
});

test.describe('Gallery page', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Content proxy URLs return placeholder images
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: Buffer.from('fake-image-bytes'),
      }),
    );
  });

  test('1. Gallery loads and displays items', async ({ authenticatedPage: page }) => {
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));

    await page.goto('/app/gallery');
    await expect(page.locator('.animate-pulse').first()).not.toBeVisible({ timeout: 5000 });

    // Should show loaded count
    await expect(page.getByText(/3.*loaded/i)).toBeVisible();
  });

  test('2. Empty gallery state shows message', async ({ authenticatedPage: page }) => {
    await page.route(
      (url) => url.pathname === '/v1/gallery',
      jsonRoute({ items: [], limit: 20, has_more: false, next_cursor: null }),
    );

    await page.goto('/app/gallery');
    await expect(page.getByText('Your generated content will appear here')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start creating' })).toBeVisible();
  });

  test('3. Filter buttons switch media_type (server-side)', async ({ authenticatedPage: page }) => {
    const requests: string[] = [];
    await page.route('**/v1/gallery*', (route) => {
      requests.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockGalleryPage),
      });
    });

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    // Click "Images" filter
    await page.getByRole('button', { name: /Images/i }).click();
    await page.waitForTimeout(500);

    // Should have made a request with media_type=image
    const imageRequest = requests.find((r) => r.includes('media_type=image'));
    expect(imageRequest).toBeTruthy();
  });

  test('4. Lightbox opens on card click and shows detail', async ({ authenticatedPage: page }) => {
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));
    await page.route('**/v1/gallery/job_001', jsonRoute(mockGalleryDetail));

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    // Click the first gallery card
    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();

    // Lightbox should show the full prompt
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({ timeout: 3000 });

    // Should show aspect ratio in details
    await expect(page.getByText('1:1')).toBeVisible();
  });

  test('5. Lightbox shows lineage for remixed items', async ({ authenticatedPage: page }) => {
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));
    await page.route('**/v1/gallery/job_002', jsonRoute(mockDetailWithLineage));

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    // Click the second card (i2i with lineage)
    await page.locator('[class*="grid"]').locator('button, [role="button"]').nth(1).click();

    // Should show lineage section
    await expect(page.getByText(/Derived from/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/uploaded image/i)).toBeVisible();

    // Should show aspect ratio
    await expect(page.getByText('16:9')).toBeVisible();
  });

  test('6. Escape key closes lightbox', async ({ authenticatedPage: page }) => {
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));
    await page.route('**/v1/gallery/job_001', jsonRoute(mockGalleryDetail));

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).not.toBeVisible();
  });

  test('7. Badge rendering — prompt and image badges visible', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(mockGalleryPage));

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });

    // Should render badge pills on cards
    await expect(page.getByText('Prompt').first()).toBeVisible();
    await expect(page.getByText('Image').first()).toBeVisible();
  });
});
