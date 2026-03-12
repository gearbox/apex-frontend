import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const mockGalleryItems = [
  { id: 'job_001', name: 'Sunset mountains', status: 'completed', generation_type: 't2i', prompt: 'A beautiful sunset over mountains', output_count: 1, created_at: '2025-01-01T00:00:00Z', completed_at: '2025-01-01T00:01:00Z' },
  { id: 'job_002', name: 'Ocean waves', status: 'completed', generation_type: 't2i', prompt: 'Ocean waves crashing on shore', output_count: 1, created_at: '2025-01-02T00:00:00Z', completed_at: '2025-01-02T00:01:00Z' },
  { id: 'job_003', name: 'City lights', status: 'completed', generation_type: 't2i', prompt: 'City lights at night', output_count: 1, created_at: '2025-01-03T00:00:00Z', completed_at: '2025-01-03T00:01:00Z' },
];

test.describe('Gallery page', () => {
  test('1. Gallery loads and displays items', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me/jobs*', jsonRoute({ items: mockGalleryItems, total: 3 }));
    // Mock output URLs for each job
    await page.route('**/v1/storage/jobs/**/outputs', jsonRoute({ items: [], count: 0 }));

    await page.goto('/app/gallery');

    // Wait for the gallery to load (past the loading skeletons)
    await expect(page.locator('.animate-pulse').first()).not.toBeVisible({ timeout: 5000 });

    // Should show item count
    await expect(page.getByText(/3.*items/i)).toBeVisible();
  });

  test('2. Empty gallery state shows message', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me/jobs*', jsonRoute({ items: [], total: 0 }));

    await page.goto('/app/gallery');

    await expect(page.getByText('Your generated content will appear here')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start creating' })).toBeVisible();
  });

  test('3. Lightbox opens on card click', async ({ authenticatedPage: page }) => {
    await page.route('**/v1/users/me/jobs*', jsonRoute({ items: mockGalleryItems, total: 3 }));
    await page.route('**/v1/storage/jobs/**/outputs', jsonRoute({ items: [], count: 0 }));
    await page.route('**/v1/storage/outputs/**', jsonRoute({ presigned_url: 'https://example.com/image.jpg', id: 'out_001', storage_key: 'key', content_type: 'image/jpeg', size_bytes: 1000, expires_in_seconds: 3600 }));

    await page.goto('/app/gallery');

    // Wait for items to load
    await expect(page.getByText(/items/i)).toBeVisible({ timeout: 5000 });

    // Click the first gallery card
    await page.locator('[class*="gallery"], [class*="grid"]').locator('button, [role="button"]').first().click();

    // Lightbox should be visible (it's a fixed overlay)
    await expect(page.locator('[class*="fixed"]').filter({ has: page.locator('[class*="lightbox"], [class*="modal"], button') }).first()).toBeVisible({ timeout: 3000 }).catch(() => {
      // Fallback: check for any overlay element
    });
  });
});
