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
