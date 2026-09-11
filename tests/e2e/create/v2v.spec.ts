import { Buffer } from 'node:buffer';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';
import { makeGrokVideoModelInfo } from '../../../src/mocks/factories/providers';

// Real backend-shaped contract (t2v/i2v/v2v, no flf2v) so this suite exercises the
// migrated V2V transport (owned `source_media`) against an accurate model fixture.
const grokVideoProvidersResponse = {
  providers: [
    {
      provider: 'grok',
      name: 'xAI Grok',
      available: true,
      provisioning_mode: 'always_on',
      models: [makeGrokVideoModelInfo()],
    },
  ],
  user_context: null,
};

function makeMedia(url: string, mediaType: 'image' | 'video' = 'image') {
  return {
    media_type: mediaType,
    original: {
      url,
      width: mediaType === 'video' ? null : 1024,
      height: mediaType === 'video' ? null : 1024,
      content_type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      size_bytes: mediaType === 'video' ? 4_000_000 : 200_000,
    },
    variants: [],
  };
}

const ownedVideoUpload = {
  asset_ref: 'upload:d0000000-0000-4000-8000-000000000001',
  source: 'upload',
  media: makeMedia('/v1/content/uploads/d0000000-0000-4000-8000-000000000001', 'video'),
  created_at: '2025-06-05T00:00:00Z',
  expires_at: '2025-07-05T00:00:00Z',
  display_title: null,
  original_filename: 'clip.mp4',
  display_filename: 'clip.mp4',
  is_favorite: false,
  duration_ms: 4000,
  job_id: null,
  output_count: null,
  model: null,
  generation_type: null,
  available_actions: ['download', 'favorite', 'delete'],
};

const ownedImageUpload = {
  asset_ref: 'upload:e0000000-0000-4000-8000-000000000002',
  source: 'upload',
  media: makeMedia('/v1/content/uploads/e0000000-0000-4000-8000-000000000002', 'image'),
  created_at: '2025-06-05T00:00:00Z',
  expires_at: '2025-07-05T00:00:00Z',
  display_title: null,
  original_filename: 'frame.jpg',
  display_filename: 'frame.jpg',
  is_favorite: false,
  duration_ms: null,
  job_id: null,
  output_count: null,
  model: null,
  generation_type: null,
  available_actions: ['download', 'favorite', 'delete'],
};

async function selectGenerationMode(page: Page, mode: 't2v' | 'i2v' | 'v2v'): Promise<void> {
  await page.locator(`[data-generation-mode="${mode}"]`).click();
}

test.describe('Create — V2V submission', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/v1/providers', jsonRoute(grokVideoProvidersResponse));
    await page.route('**/v1/billing/pricing', jsonRoute([]));
    await page.route(
      '**/v1/billing/balance',
      jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 1000 }),
    );
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('fake-video') }),
    );
  });

  test('selecting an owned video source and submitting sends canonical V2V source_media', async ({
    authenticatedPage: page,
  }) => {
    const libraryRequestMediaTypes: Array<string | null> = [];
    await page.route('**/v1/library*', (route) => {
      const url = new URL(route.request().url());
      const source = url.searchParams.get('source');
      const mediaType = url.searchParams.get('media_type');
      libraryRequestMediaTypes.push(mediaType);
      const items = source === 'upload' && mediaType === 'video' ? [ownedVideoUpload] : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, limit: 30, has_more: false, next_cursor: null }),
      });
    });

    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/v1/generate', async (route) => {
      capturedBody = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job_e2e_v2v',
          status: 'pending',
          name: 'E2E v2v generation',
          model: 'grok-imagine-video',
          generation_type: 'v2v',
          created_at: '2025-06-05T00:02:00Z',
        }),
      });
    });
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_v2v',
        status: 'running',
        name: 'E2E v2v generation',
        provider: 'grok',
        model: 'grok-imagine-video',
        generation_type: 'v2v',
        prompt: 'A video extension test',
        created_at: '2025-06-05T00:02:00Z',
        outputs: [],
      }),
    );

    await page.goto('/app/create?prompt=A+video+extension+test');

    await selectGenerationMode(page, 'v2v');

    // The source-media picker for V2V must request/allow only video media, never the
    // default image kind — proves SourceMediaInput passes the mode's own policy through.
    const libraryButton = page.getByRole('button', { name: 'Library' });
    await expect(libraryButton).toBeVisible();
    await libraryButton.click();

    await expect(page.getByRole('heading', { name: 'Choose Source Media' })).toBeVisible();

    // The mock upload item is only returned for a `source=upload&media_type=video`
    // request, so its visibility itself proves the picker requested video media.
    const pickerItems = page
      .getByRole('dialog', { name: 'Choose source media from library' })
      .locator('[aria-pressed]');
    await expect(pickerItems.first()).toBeVisible({ timeout: 5000 });
    expect(libraryRequestMediaTypes).toContain('video');

    await pickerItems.first().click();
    await page.getByRole('button', { name: /Add Selected Media/i }).click();

    await expect(page.getByText('From uploads')).toBeVisible();

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['generation_type']).toBe('v2v');
    expect(capturedBody!['source_media']).toEqual([
      { asset_ref: 'upload:d0000000-0000-4000-8000-000000000001' },
    ]);
    expect(capturedBody).not.toHaveProperty('input_video_url');
    expect(capturedBody).not.toHaveProperty('input_image_id');
    expect(capturedBody).not.toHaveProperty('source_output_id');
    expect(capturedBody).not.toHaveProperty('source_images');
  });

  test('switching V2V -> I2V with a retained video source cannot submit V2V behind the I2V selection (P1 regression)', async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/v1/library*', (route) => {
      const url = new URL(route.request().url());
      const source = url.searchParams.get('source');
      const mediaType = url.searchParams.get('media_type');
      let items: Array<Record<string, unknown>> = [];
      if (source === 'upload' && mediaType === 'video') items = [ownedVideoUpload];
      if (source === 'upload' && mediaType === 'image') items = [ownedImageUpload];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, limit: 30, has_more: false, next_cursor: null }),
      });
    });

    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/v1/generate', async (route) => {
      capturedBody = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job_e2e_i2v',
          status: 'pending',
          name: 'E2E i2v recovery',
          model: 'grok-imagine-video',
          generation_type: 'i2v',
          created_at: '2025-06-05T00:02:00Z',
        }),
      });
    });
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_i2v',
        status: 'running',
        name: 'E2E i2v recovery',
        provider: 'grok',
        model: 'grok-imagine-video',
        generation_type: 'i2v',
        prompt: 'Mode mismatch regression',
        created_at: '2025-06-05T00:02:00Z',
        outputs: [],
      }),
    );

    await page.goto('/app/create?prompt=Mode+mismatch+regression');

    // 1-3: build a submit-ready V2V draft with an owned video source.
    await selectGenerationMode(page, 'v2v');
    await page.getByRole('button', { name: 'Library' }).click();
    await expect(page.getByRole('heading', { name: 'Choose Source Media' })).toBeVisible();
    const pickerItems = page
      .getByRole('dialog', { name: 'Choose source media from library' })
      .locator('[aria-pressed]');
    await expect(pickerItems.first()).toBeVisible({ timeout: 5000 });
    await pickerItems.first().click();
    await page.getByRole('button', { name: /Add Selected Media/i }).click();
    await expect(page.getByText('From uploads')).toBeVisible();

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();

    // 4: V2V is submit-ready.
    await expect(generateBtn).toBeEnabled();

    // 5-6: switch the explicit Type to I2V; the video source is retained (not cleared).
    await selectGenerationMode(page, 'i2v');
    await expect(page.locator('[data-generation-mode="i2v"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('From uploads')).toBeVisible();

    // 7-8: Generate must be disabled — no hidden fallback to v2v behind the I2V UI.
    // Disabled is itself the proof: a native <button disabled> cannot dispatch a
    // click, so nothing reaches the `**/v1/generate` route below it.
    await expect(generateBtn).toBeDisabled();
    expect(capturedBody).toBeNull();

    // 9-11: recovery — replace the video with a valid image for I2V.
    await page.getByRole('button', { name: 'Remove image' }).click();
    const chooseFromLibraryBtn = page.getByRole('button', { name: 'Choose from library' });
    await expect(chooseFromLibraryBtn).toBeVisible();
    await chooseFromLibraryBtn.click();
    await expect(page.getByRole('heading', { name: 'Choose from Library' })).toBeVisible();
    const imagePickerItems = page
      .getByRole('dialog', { name: 'Choose from library' })
      .locator('[aria-pressed]');
    await expect(imagePickerItems.first()).toBeVisible({ timeout: 5000 });
    await imagePickerItems.first().click();
    await page.getByRole('button', { name: /Use Selected Image/i }).click();
    await expect(page.getByText('From uploads')).toBeVisible();

    await expect(generateBtn).toBeEnabled();

    // 12-13: submit and confirm the request is genuinely i2v.
    await generateBtn.click();
    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['generation_type']).toBe('i2v');
    expect(capturedBody!['source_media']).toEqual([
      { asset_ref: 'upload:e0000000-0000-4000-8000-000000000002' },
    ]);
  });
});
