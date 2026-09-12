import { Buffer } from 'node:buffer';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';
import { makeAishaVideoModelInfo } from '../../../src/mocks/factories/providers';

// Aisha Video always_on (generates without a GPU session) — real current contract:
// t2v (no source), i2v ([first_frame]), flf2v ([first_frame, last_frame]).
const aishaVideoProvidersResponse = {
  providers: [
    {
      provider: 'aisha',
      name: 'Aisha',
      available: true,
      provisioning_mode: 'always_on',
      models: [makeAishaVideoModelInfo()],
    },
  ],
  user_context: null,
};

function makeImageMedia(url: string) {
  return {
    media_type: 'image' as const,
    original: { url, width: 1024, height: 1024, content_type: 'image/jpeg', size_bytes: 200_000 },
    variants: [],
  };
}

function makeUploadItem(assetRef: string, filename: string) {
  return {
    asset_ref: assetRef,
    source: 'upload',
    media: makeImageMedia(`/v1/content/uploads/${assetRef.replace('upload:', '')}`),
    created_at: '2025-06-05T00:00:00Z',
    expires_at: '2025-07-05T00:00:00Z',
    display_title: null,
    original_filename: filename,
    display_filename: filename,
    is_favorite: false,
    duration_ms: null,
    job_id: null,
    output_count: null,
    model: null,
    generation_type: null,
    available_actions: ['download', 'favorite', 'delete'],
  };
}

const uploadA = makeUploadItem('upload:a0000000-0000-4000-8000-000000000001', 'a-frame.jpg');
const uploadB = makeUploadItem('upload:b0000000-0000-4000-8000-000000000002', 'b-frame.jpg');

test.describe('Create — Aisha Video positional first/last frame roles', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Aisha Video requires age verification — override the fixture's default
    // unverified profile so Generate reaches the request instead of the gate.
    await page.route(
      '**/v1/users/me',
      jsonRoute({
        id: 'usr_e2e_001',
        email: 'e2e@example.com',
        display_name: 'E2E User',
        subscription_tier: 'free',
        email_verified: true,
        age_verified: true,
        age_verified_at: '2026-01-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }),
    );
    await page.route('**/v1/providers', jsonRoute(aishaVideoProvidersResponse));
    await page.route('**/v1/billing/pricing', jsonRoute([]));
    await page.route(
      '**/v1/billing/balance',
      jsonRoute({ account_id: 'acc_001', account_type: 'personal', balance: 1000 }),
    );
    await page.route('**/v1/library*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [uploadA, uploadB],
          limit: 30,
          has_more: false,
          next_cursor: null,
        }),
      }),
    );
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake-image') }),
    );
  });

  test('adding first frame then last frame submits FLF2V with contract-ordered source_media', async ({
    authenticatedPage: page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/v1/generate', async (route) => {
      capturedBody = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job_e2e_flf2v',
          status: 'pending',
          name: 'E2E flf2v generation',
          model: 'aisha-video',
          generation_type: 'flf2v',
          created_at: '2025-06-05T00:02:00Z',
        }),
      });
    });
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_flf2v',
        status: 'running',
        name: 'E2E flf2v generation',
        provider: 'aisha',
        model: 'aisha-video',
        generation_type: 'flf2v',
        prompt: 'A first-and-last-frame test',
        created_at: '2025-06-05T00:02:00Z',
        outputs: [],
      }),
    );

    await page.goto('/app/create?prompt=A+first-and-last-frame+test');

    // No mode selector: both role slots are offered from discovery alone.
    const firstFrameSlot = page.getByTestId('role-slot-first_frame');
    const lastFrameSlot = page.getByTestId('role-slot-last_frame');
    await expect(firstFrameSlot.getByText('First frame', { exact: true })).toBeVisible();
    await expect(lastFrameSlot.getByText('Last frame', { exact: true })).toBeVisible();

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();

    // Empty draft — T2V is submit-ready.
    await expect(generateBtn).toBeEnabled();

    // Fill first frame.
    await firstFrameSlot.getByRole('button', { name: 'Library' }).click();
    const firstPicker = page.getByRole('dialog', { name: 'Choose from library' });
    await expect(firstPicker.locator('[aria-pressed]').first()).toBeVisible({ timeout: 5000 });
    await firstPicker.locator('[aria-pressed]').nth(0).click();
    await page.getByRole('button', { name: /Use Selected Image/i }).click();
    await expect(firstFrameSlot.getByText('From uploads')).toBeVisible();

    // I2V is submit-ready with only first frame filled.
    await expect(generateBtn).toBeEnabled();

    // Fill last frame.
    await lastFrameSlot.getByRole('button', { name: 'Library' }).click();
    const lastPicker = page.getByRole('dialog', { name: 'Choose from library' });
    await expect(lastPicker.locator('[aria-pressed]').first()).toBeVisible({ timeout: 5000 });
    await lastPicker.locator('[aria-pressed]').nth(1).click();
    await page.getByRole('button', { name: /Use Selected Image/i }).click();
    await expect(lastFrameSlot.getByText('From uploads')).toBeVisible();

    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();
    expect(capturedBody).toMatchObject({
      generation_type: 'flf2v',
      source_media: [{ asset_ref: uploadA.asset_ref }, { asset_ref: uploadB.asset_ref }],
    });
  });

  test('selecting last frame before first frame still submits in contract order [first, last]', async ({
    authenticatedPage: page,
  }) => {
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/v1/generate', async (route) => {
      capturedBody = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job_e2e_flf2v_sparse',
          status: 'pending',
          name: 'E2E sparse flf2v generation',
          model: 'aisha-video',
          generation_type: 'flf2v',
          created_at: '2025-06-05T00:02:00Z',
        }),
      });
    });
    await page.route(
      '**/v1/jobs/**',
      jsonRoute({
        id: 'job_e2e_flf2v_sparse',
        status: 'running',
        name: 'E2E sparse flf2v generation',
        provider: 'aisha',
        model: 'aisha-video',
        generation_type: 'flf2v',
        prompt: 'A sparse-order test',
        created_at: '2025-06-05T00:02:00Z',
        outputs: [],
      }),
    );

    await page.goto('/app/create?prompt=A+sparse-order+test');

    const generateBtn = page.getByRole('button', { name: /Generate/i }).first();

    // Fill last frame first.
    const lastFrameSlot = page.getByTestId('role-slot-last_frame');
    await lastFrameSlot.getByRole('button', { name: 'Library' }).click();
    const firstPicker = page.getByRole('dialog', { name: 'Choose from library' });
    await expect(firstPicker.locator('[aria-pressed]').first()).toBeVisible({ timeout: 5000 });
    await firstPicker.locator('[aria-pressed]').nth(1).click(); // uploadB -> last_frame
    await page.getByRole('button', { name: /Use Selected Image/i }).click();
    await expect(lastFrameSlot.getByText('From uploads')).toBeVisible();

    // Aisha's i2v role is first_frame specifically, so a lone last_frame is an
    // incomplete FLF2V draft — Generate must stay disabled.
    await expect(generateBtn).toBeDisabled();

    // Now fill first frame.
    const firstFrameSlot = page.getByTestId('role-slot-first_frame');
    await firstFrameSlot.getByRole('button', { name: 'Library' }).click();
    const secondPicker = page.getByRole('dialog', { name: 'Choose from library' });
    await expect(secondPicker.locator('[aria-pressed]').first()).toBeVisible({ timeout: 5000 });
    await secondPicker.locator('[aria-pressed]').nth(0).click(); // uploadA -> first_frame
    await page.getByRole('button', { name: /Use Selected Image/i }).click();
    await expect(firstFrameSlot.getByText('From uploads')).toBeVisible();

    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByRole('button', { name: /Submitting|Generating/i })).toBeVisible();
    // Selection order was [last, first] — the request must still be contract-ordered [first, last].
    expect(capturedBody).toMatchObject({
      generation_type: 'flf2v',
      source_media: [{ asset_ref: uploadA.asset_ref }, { asset_ref: uploadB.asset_ref }],
    });
  });
});
