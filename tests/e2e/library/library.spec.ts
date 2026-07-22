import { Buffer } from 'node:buffer';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

function makeMedia(
  url: string,
  mediaType: 'image' | 'video' = 'image',
  variants: Array<{ label: string; width: number; height: number; url: string }> = [],
) {
  return {
    media_type: mediaType,
    original: {
      url,
      width: mediaType === 'video' ? null : 1024,
      height: mediaType === 'video' ? null : 1024,
      content_type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      size_bytes: mediaType === 'video' ? 5000000 : 102400,
    },
    variants,
  };
}

// Single-output t2i image asset — opens AssetDetailsSheet on click.
const itemImageSingle = {
  asset_ref: 'output:a0000000-0000-4000-8000-000000000001',
  source: 'output',
  media: makeMedia('/v1/content/outputs/a0000000-0000-4000-8000-000000000001'),
  created_at: '2025-01-01T00:00:00Z',
  expires_at: '2025-07-01T00:00:00Z',
  display_title: null,
  original_filename: null,
  is_favorite: false,
  duration_ms: null,
  job_id: 'job_001',
  output_count: 1,
  model: 'grok-imagine-image',
  generation_type: 't2i',
  available_actions: ['remix', 'download', 'favorite', 'rename', 'delete'],
};

// Multi-output i2i job — opens GroupSheet on click.
const itemImageGroup = {
  asset_ref: 'output:a0000000-0000-4000-8000-000000000002',
  source: 'output',
  media: makeMedia('/v1/content/outputs/a0000000-0000-4000-8000-000000000002'),
  created_at: '2025-01-02T00:00:00Z',
  expires_at: '2025-07-02T00:00:00Z',
  display_title: null,
  original_filename: null,
  is_favorite: false,
  duration_ms: null,
  job_id: 'job_002',
  output_count: 2,
  model: 'grok-imagine-image',
  generation_type: 'i2i',
  available_actions: ['remix', 'download', 'favorite', 'delete'],
};

// Single-output t2v video asset.
const itemVideoSingle = {
  asset_ref: 'output:a0000000-0000-4000-8000-000000000003',
  source: 'output',
  media: makeMedia('/v1/content/outputs/a0000000-0000-4000-8000-000000000003', 'video'),
  created_at: '2025-01-03T00:00:00Z',
  expires_at: '2025-07-03T00:00:00Z',
  display_title: null,
  original_filename: null,
  is_favorite: false,
  duration_ms: 4000,
  job_id: 'job_003',
  output_count: 1,
  model: 'grok-imagine-video',
  generation_type: 't2v',
  available_actions: ['reproduce', 'download', 'favorite', 'delete'],
};

// Uploaded asset — provenance badge should read "Uploaded".
const itemUpload = {
  asset_ref: 'upload:b0000000-0000-4000-8000-000000000001',
  source: 'upload',
  media: makeMedia('/v1/content/uploads/b0000000-0000-4000-8000-000000000001'),
  created_at: '2025-01-04T00:00:00Z',
  expires_at: '2025-07-04T00:00:00Z',
  display_title: null,
  original_filename: 'photo.jpg',
  is_favorite: false,
  duration_ms: null,
  job_id: null,
  output_count: null,
  model: null,
  generation_type: null,
  available_actions: ['download', 'favorite', 'delete'],
};

const mockLibraryItems = [itemImageSingle, itemImageGroup, itemVideoSingle, itemUpload];

const mockLibraryPage = {
  items: mockLibraryItems,
  limit: 20,
  has_more: false,
  next_cursor: null,
};

const mockAssetDetailImage = {
  ...itemImageSingle,
  prompt: 'A beautiful sunset over mountains with golden light streaming through clouds',
  negative_prompt: null,
  provider: 'grok',
  aspect_ratio: '1:1',
  token_cost: 10,
  completed_at: '2025-01-01T00:01:00Z',
  lineage: null,
  descendants: { job_count: 0, frame_count: 0 },
};

const mockAssetDetailVideo = {
  ...itemVideoSingle,
  prompt: 'City lights at night timelapse',
  negative_prompt: null,
  provider: 'grok',
  aspect_ratio: '16:9',
  token_cost: 20,
  completed_at: '2025-01-03T00:01:00Z',
  lineage: null,
  descendants: { job_count: 0, frame_count: 0 },
};

const mockGroupDetail = {
  job_id: 'job_002',
  badge: 'image',
  input_media: makeMedia('/v1/content/uploads/b0000000-0000-4000-8000-000000000099'),
  prompt: 'Ocean waves crashing on shore under a stylised sky',
  negative_prompt: null,
  outputs: [
    {
      id: 'a0000000-0000-4000-8000-00000000002a',
      asset_ref: 'output:a0000000-0000-4000-8000-00000000002a',
      output_index: 0,
      created_at: '2025-01-02T00:01:00Z',
      expires_at: '2025-07-02T00:00:00Z',
      media: makeMedia('/v1/content/outputs/a0000000-0000-4000-8000-00000000002a'),
    },
    {
      id: 'a0000000-0000-4000-8000-00000000002b',
      asset_ref: 'output:a0000000-0000-4000-8000-00000000002b',
      output_index: 1,
      created_at: '2025-01-02T00:01:00Z',
      expires_at: '2025-07-02T00:00:00Z',
      media: makeMedia('/v1/content/outputs/a0000000-0000-4000-8000-00000000002b'),
    },
  ],
  media_type: 'image',
  model: 'grok-imagine-image',
  provider: 'grok',
  generation_type: 'i2i',
  aspect_ratio: '16:9',
  token_cost: 15,
  created_at: '2025-01-02T00:00:00Z',
  completed_at: '2025-01-02T00:01:00Z',
  lineage: null,
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

async function swipeLeft(swipeContent: Locator, distance: number) {
  await swipeContent.evaluate((element, swipeDistance) => {
    const startX = 200;
    const startY = 100;

    function dispatchTouch(type: string, clientX?: number) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: clientX === undefined ? [] : [{ clientX, clientY: startY }],
      });
      element.dispatchEvent(event);
    }

    dispatchTouch('touchstart', startX);
    dispatchTouch('touchmove', startX - swipeDistance);
    dispatchTouch('touchend');
  }, distance);
}

async function revealDeleteAction(page: Page) {
  const swipeWrapper = page.locator('.swipe-wrapper').first();
  const swipeContent = swipeWrapper.locator('.swipe-content');
  const deleteAction = swipeWrapper.locator('.delete-action');

  await swipeLeft(swipeContent, 80);
  await expect(swipeContent).toHaveAttribute('style', /translateX\(-80px\)/);
  await expect
    .poll(async () => {
      const [contentBox, actionBox] = await Promise.all([
        swipeContent.boundingBox(),
        deleteAction.boundingBox(),
      ]);
      if (!contentBox || !actionBox) return Number.POSITIVE_INFINITY;
      return Math.round(contentBox.x + contentBox.width - actionBox.x);
    })
    .toBe(0);

  return { swipeWrapper, swipeContent };
}

test.describe('Library deletion', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake') }),
    );
  });

  test(
    'Mobile revealed swipe delete action opens the confirmation dialog',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));

      await page.goto('/app/library');
      await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

      const { swipeWrapper } = await revealDeleteAction(page);
      const deleteAction = swipeWrapper.locator('.delete-action');
      const box = await deleteAction.boundingBox();
      if (!box) throw new Error('Expected delete action to have a bounding box');

      const actionPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const hitTarget = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element?.closest('.delete-action')?.className ?? element?.className ?? null;
      }, actionPoint);
      expect(hitTarget).toContain('delete-action');
      await page.mouse.click(actionPoint.x, actionPoint.y);

      await expect(page.getByText(/permanently deleted/i)).toHaveCount(1);
    },
  );

  test(
    'Mobile open card tap closes the swipe without opening or deleting the card',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));

      await page.goto('/app/library');
      await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

      const { swipeWrapper, swipeContent } = await revealDeleteAction(page);
      const closeOverlay = swipeWrapper.locator('.swipe-close-overlay');
      const box = await closeOverlay.boundingBox();
      if (!box) throw new Error('Expected close overlay to have a bounding box');

      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      await expect(closeOverlay).toHaveCount(0);
      await expect(swipeContent).toHaveAttribute('style', /translateX\(0px\)/);
      await expect(page.getByRole('dialog', { name: /asset details/i })).toHaveCount(0);
      await expect(page.getByText(/permanently deleted/i)).toHaveCount(0);
    },
  );

  test(
    'Mobile overswipe still opens the deletion confirmation dialog',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));

      await page.goto('/app/library');
      await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

      const swipeContent = page.locator('.swipe-wrapper').first().locator('.swipe-content');
      await swipeLeft(swipeContent, 130);

      await expect(page.getByText(/permanently deleted/i)).toHaveCount(1);
    },
  );

  test('Delete button in Asset Details shows confirm dialog', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/assets/**', (route) => {
      if (route.request().method() === 'GET') return jsonRoute(mockAssetDetailImage)(route);
      return route.continue();
    });

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    // Open the single-output asset details sheet
    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({
      timeout: 3000,
    });

    // Click delete button (trash icon)
    await page.getByRole('button', { name: /delete/i }).click();

    // Confirm dialog should appear
    await expect(page.getByText(/permanently deleted/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('Confirm delete calls API and closes the sheet for a single-output asset', async ({
    authenticatedPage: page,
  }) => {
    let deleteRequested = false;
    let deletedPath = '';
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/assets/**', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteRequested = true;
        deletedPath = new URL(route.request().url()).pathname;
        return route.fulfill({ status: 204 });
      }
      return jsonRoute(mockAssetDetailImage)(route);
    });

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({
      timeout: 3000,
    });

    await page.getByRole('button', { name: /delete/i }).click();

    const deleteResponse = page.waitForResponse(
      (res) => res.request().method() === 'DELETE' && res.url().includes('/v1/library/assets/'),
    );
    await page
      .getByRole('button', { name: /delete/i })
      .last()
      .click(); // confirm button in modal
    await deleteResponse;

    expect(deleteRequested).toBe(true);
    expect(deletedPath).toContain('/v1/library/assets/');
    await expect(page.getByRole('dialog', { name: /asset details/i })).toHaveCount(0);
  });

  test('Cancel delete closes dialog without API call', async ({ authenticatedPage: page }) => {
    let deleteRequested = false;
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/assets/**', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteRequested = true;
        return route.fulfill({ status: 204 });
      }
      return jsonRoute(mockAssetDetailImage)(route);
    });

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({
      timeout: 3000,
    });

    await page.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /cancel/i }).click();

    await expect(page.getByText(/permanently deleted/i)).not.toBeVisible();
    expect(deleteRequested).toBe(false);
  });

  test('Right-click context menu shows Delete option on desktop', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    const firstCard = page.locator('[class*="grid"] button.absolute.inset-0.z-0').first();
    await firstCard.click({ button: 'right' });

    await expect(page.getByText(/delete/i).last()).toBeVisible({ timeout: 2000 });
  });
});

test.describe('Library actions — Remix / Reproduce', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake') }),
    );
    await page.route('**/v1/providers', jsonRoute(mockProvidersResponse));
    await page.route(
      '**/v1/billing/balance',
      jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 1000 }),
    );
    await page.route('**/v1/billing/pricing', jsonRoute([]));
  });

  test('Remix button in Asset Details navigates to Create page with I2I mode and source image', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/assets/**', jsonRoute(mockAssetDetailImage));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({
      timeout: 3000,
    });

    await page.getByRole('button', { name: 'Remix' }).click();

    await expect(page).toHaveURL(/\/app\/create/, { timeout: 5000 });

    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toHaveValue(
      /A beautiful sunset over mountains with golden light/i,
      {
        timeout: 3000,
      },
    );

    await expect(page.getByText(/Source Image/i)).toBeVisible();
    await expect(page.getByText('From generated')).toBeVisible();
  });

  test('Reproduce button on a video asset navigates to Create without a source image', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/assets/**', jsonRoute(mockAssetDetailVideo));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    // Third card is the single-output video asset
    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').nth(2).click();
    await expect(page.getByText('City lights at night timelapse').first()).toBeVisible({
      timeout: 3000,
    });

    await page.getByRole('button', { name: 'Reproduce' }).click();

    await expect(page).toHaveURL(/\/app\/create/, { timeout: 5000 });

    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toHaveValue(/City lights at night timelapse/i, { timeout: 3000 });
    await expect(page.getByText('From generated')).not.toBeVisible();
  });

  test('Remix button in Group Sheet navigates to Create page with I2I mode and source image', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/groups/job_002', jsonRoute(mockGroupDetail));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    // Second card is the multi-output i2i job — opens Group Sheet
    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').nth(1).click();
    await expect(page.getByText('Source image')).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: 'Remix' }).click();

    await expect(page).toHaveURL(/\/app\/create/, { timeout: 5000 });
    await expect(page.getByText(/Source Image/i)).toBeVisible();
    await expect(page.getByText('From generated')).toBeVisible();
  });
});

test.describe('Library page', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: Buffer.from('fake-image-bytes'),
      }),
    );
  });

  test('1. Library loads and displays items', async ({ authenticatedPage: page }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));

    await page.goto('/app/library');
    await expect(page.locator('.animate-pulse').first()).not.toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/4.*loaded/i)).toBeVisible();
  });

  test('2. Empty library state shows message', async ({ authenticatedPage: page }) => {
    await page.route(
      (url) => url.pathname === '/v1/library',
      jsonRoute({ items: [], limit: 20, has_more: false, next_cursor: null }),
    );

    await page.goto('/app/library');
    await expect(
      page.getByText('Your library is empty. Create or upload something!'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start creating' })).toBeVisible();
  });

  test('3. Filter buttons switch media_type (server-side)', async ({ authenticatedPage: page }) => {
    const requests: string[] = [];
    await page.route('**/v1/library*', (route) => {
      requests.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibraryPage),
      });
    });

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Images' }).click();
    await page.waitForTimeout(500);

    const imageRequest = requests.find((r) => r.includes('media_type=image'));
    expect(imageRequest).toBeTruthy();
  });

  test('4. Asset Details sheet opens on card click and shows detail', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/assets/**', jsonRoute(mockAssetDetailImage));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').first().click();

    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByText('1:1')).toBeVisible();
  });

  test('5. Group Sheet shows the source image for multi-output i2i jobs', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/groups/job_002', jsonRoute(mockGroupDetail));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').nth(1).click();

    await expect(page.getByText('Source image')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('16:9')).toBeVisible();
  });

  test('6. Escape key closes Asset Details sheet', async ({ authenticatedPage: page }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));
    await page.route('**/v1/library/assets/**', jsonRoute(mockAssetDetailImage));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').first().click();
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).toBeVisible({
      timeout: 3000,
    });

    await page.keyboard.press('Escape');
    await expect(
      page.getByText('A beautiful sunset over mountains with golden light').first(),
    ).not.toBeVisible();
  });

  test('7. Provenance badges — Uploaded and Generated are visible', async ({
    authenticatedPage: page,
  }) => {
    await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('Generated').first()).toBeVisible();
    await expect(page.getByText('Uploaded').first()).toBeVisible();
    await expect(page.getByTestId('library-media-icon-image')).toHaveCount(3);
    await expect(page.getByTestId('library-media-icon-video')).toHaveCount(1);
  });

  test(
    'Mobile cards support direct multi-selection without opening their details',
    { tag: '@mobile' },
    async ({ authenticatedPage: page }) => {
      await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));

      await page.goto('/app/library');
      await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

      const selectionControls = page.getByTestId('library-selection-control');
      await expect(selectionControls).toHaveCount(4);
      await expect(selectionControls.nth(0)).toBeVisible();
      await expect(selectionControls.nth(1)).toBeVisible();
      const firstControlBox = await selectionControls.nth(0).boundingBox();
      expect(firstControlBox?.width).toBeGreaterThanOrEqual(40);
      expect(firstControlBox?.height).toBeGreaterThanOrEqual(40);

      await selectionControls.nth(0).tap();
      await expect(selectionControls.nth(0)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('toolbar', { name: '1 selected' })).toBeVisible();
      await expect(page.getByRole('dialog', { name: /asset details/i })).toHaveCount(0);

      await selectionControls.nth(1).tap();
      await expect(selectionControls.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('toolbar', { name: '2 selected' })).toBeVisible();

      await selectionControls.nth(0).tap();
      await expect(selectionControls.nth(0)).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByRole('toolbar', { name: '1 selected' })).toBeVisible();
    },
  );

  test(
    'Desktop selection controls are hover-revealed and stay visible after selection',
    { tag: '@desktop' },
    async ({ authenticatedPage: page }) => {
      await page.route((url) => url.pathname === '/v1/library', jsonRoute(mockLibraryPage));

      await page.goto('/app/library');
      await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

      const selectionControl = page.getByTestId('library-selection-control').first();
      const opacity = () =>
        selectionControl.evaluate((element) => getComputedStyle(element).opacity);
      await expect.poll(opacity).toBe('0');

      await selectionControl.hover();
      await expect.poll(opacity).toBe('1');

      await selectionControl.click();
      await page.mouse.move(0, 0);
      await expect.poll(opacity).toBe('1');
    },
  );
});

test.describe('Library media rendering', () => {
  // Minimal valid 1×1 GIF — prevents onerror from firing in MediaImage,
  // which would otherwise strip the srcset attribute via the error-fallback path.
  const MINIMAL_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64',
  );

  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: MINIMAL_GIF,
      }),
    );
  });

  test('8. Empty-variants: details sheet img uses original src and has no srcset', async ({
    authenticatedPage: page,
  }) => {
    const legacyUrl = '/v1/content/outputs/a0000000-0000-4000-8000-0000000000fe';
    const legacyItem = {
      ...itemImageSingle,
      asset_ref: 'output:a0000000-0000-4000-8000-0000000000fe',
      job_id: 'job_legacy',
      media: makeMedia(legacyUrl, 'image'),
    };
    const legacyDetail = {
      ...mockAssetDetailImage,
      asset_ref: 'output:a0000000-0000-4000-8000-0000000000fe',
      job_id: 'job_legacy',
      media: makeMedia(legacyUrl, 'image'),
      prompt: 'Legacy image',
    };
    const legacyPage = { items: [legacyItem], limit: 20, has_more: false, next_cursor: null };

    await page.route((url) => url.pathname === '/v1/library', jsonRoute(legacyPage));
    await page.route('**/v1/library/assets/**', jsonRoute(legacyDetail));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').first().click();
    await expect(page.getByText('Legacy image').first()).toBeVisible({ timeout: 3000 });

    const img = page.locator('img').first();
    await expect(img).toHaveAttribute('src', new RegExp(legacyUrl.replace(/\//g, '\\/')));
    await expect(img).not.toHaveAttribute('srcset');
  });

  test('9. Variants-present: details sheet img srcset contains 150w and 512w', async ({
    authenticatedPage: page,
  }) => {
    const baseUrl = '/v1/content/outputs/a0000000-0000-4000-8000-0000000000fd';
    const variants = [
      { label: 'sm', width: 150, height: 150, url: `${baseUrl}_sm` },
      { label: 'md', width: 512, height: 512, url: `${baseUrl}_md` },
    ];
    const srcsetItem = {
      ...itemImageSingle,
      asset_ref: 'output:a0000000-0000-4000-8000-0000000000fd',
      job_id: 'job_srcset',
      media: makeMedia(baseUrl, 'image', variants),
    };
    const srcsetDetail = {
      ...mockAssetDetailImage,
      asset_ref: 'output:a0000000-0000-4000-8000-0000000000fd',
      job_id: 'job_srcset',
      media: makeMedia(baseUrl, 'image', variants),
      prompt: 'Srcset image',
    };
    const srcsetPage = { items: [srcsetItem], limit: 20, has_more: false, next_cursor: null };

    await page.route((url) => url.pathname === '/v1/library', jsonRoute(srcsetPage));
    await page.route('**/v1/library/assets/**', jsonRoute(srcsetDetail));

    await page.goto('/app/library');
    await expect(page.getByText(/\d+\s*loaded/i)).toBeVisible({ timeout: 5000 });

    await page.locator('[class*="grid"] button.absolute.inset-0.z-0').first().click();
    await expect(page.getByText('Srcset image').first()).toBeVisible({ timeout: 3000 });

    const img = page.locator('img').first();
    const srcset = await img.getAttribute('srcset');
    expect(srcset).toMatch(/150w/);
    expect(srcset).toMatch(/512w/);
  });
});
