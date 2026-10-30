import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';
import { makeWanModelInfo } from '../../../src/mocks/fixtures/wan';
import { makeLibraryAssetItem } from '../../../src/mocks/factories/library';
import { makeMediaObject } from '../../../src/mocks/factories/media';
import { makeUnifiedJobResponse } from '../../../src/mocks/factories/job';
import { makePricingRule, makeGenerationModel } from '../../../src/mocks/factories/admin';

const provider = {
  providers: [
    {
      provider: 'alibaba',
      name: 'Alibaba Wan',
      available: true,
      provisioning_mode: 'always_on',
      models: [makeWanModelInfo()],
    },
  ],
  user_context: null,
};
const images = ['a', 'b', 'c'].map((id) =>
  makeLibraryAssetItem({
    asset_ref: `upload:${id}`,
    source: 'upload',
    original_filename: `${id}.jpg`,
    media: makeMediaObject({
      original: { url: `/v1/content/uploads/${id}`, content_type: 'image/jpeg', size_bytes: 10 },
    }),
  }),
);
const videos = ['webm', 'mp4'].map((format) =>
  makeLibraryAssetItem({
    asset_ref: `upload:${format}`,
    source: 'upload',
    original_filename: `clip.${format}`,
    media: makeMediaObject({
      media_type: 'video',
      original: {
        url: `/v1/content/uploads/${format}`,
        content_type: `video/${format}`,
        size_bytes: 100,
        duration_ms: 12000,
      },
    }),
  }),
);
async function setup(page: Page, pricing: ReturnType<typeof makePricingRule>[] = []) {
  await page.route('**/v1/providers', jsonRoute(provider));
  await page.route('**/v1/billing/pricing', jsonRoute(pricing));
  await page.route(
    '**/v1/library/projects**',
    jsonRoute({ items: [], limit: 20, has_more: false, next_cursor: null }),
  );
  await page.route('**/v1/library?**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      json: {
        items:
          url.searchParams.get('source') === 'output'
            ? []
            : url.searchParams.get('media_type') === 'video'
              ? videos
              : images,
        limit: 20,
        has_more: false,
        next_cursor: null,
      },
    });
  });
  await page.route('**/v1/content/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route(
    '**/v1/jobs/**',
    jsonRoute(
      makeUnifiedJobResponse({
        id: 'wan-job',
        model: 'wan3.0-video',
        provider: 'alibaba',
        status: 'running',
        outputs: [],
      }),
    ),
  );
  let body: Record<string, unknown> | null = null;
  await page.route('**/v1/generate', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        job_id: 'wan-job',
        status: 'queued',
        name: 'Wan test',
        model: 'wan3.0-video',
        generation_type: body?.generation_type,
        created_at: new Date().toISOString(),
      },
    });
  });
  await page.goto('/app/create');
  await expect(page.getByRole('button', { name: /Wan 3.0/ }).first()).toBeVisible();
  return () => body;
}
async function chooseImage(page: Page, name: string, firstFrame = false) {
  if (firstFrame)
    await page
      .getByTestId('role-slot-first_frame')
      .getByRole('button', { name: 'Library' })
      .click();
  else await page.getByRole('button', { name: 'Library', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: new RegExp(name.replace('.', '\\.')) }).click();
  await dialog.getByRole('button', { name: /Use Selected Image|Add Selected Media/ }).click();
}

test('Wan T2V sends exact selected controls @cross-browser', async ({
  authenticatedPage: page,
}) => {
  const body = await setup(page);
  await page.getByRole('textbox').first().fill('A fox runs through snow');
  await page.getByRole('button', { name: '1080p', exact: true }).click();
  await page.getByRole('slider').fill('10');
  await page.getByRole('button', { name: '16:9', exact: true }).click();
  await page
    .getByRole('group', { name: 'Audio', exact: true })
    .getByRole('button', { name: 'Off', exact: true })
    .click();
  await page
    .getByRole('button', { name: /Generate/i })
    .first()
    .click();
  await expect.poll(body).toEqual({
    prompt: 'A fox runs through snow',
    generation_type: 't2v',
    model: 'wan3.0-video',
    n: 1,
    duration: 10,
    resolution: '1080p',
    aspect_ratio: '16:9',
    audio: false,
  });
});
test('Wan I2V omits anchored aspect ratio @cross-browser', async ({ authenticatedPage: page }) => {
  const body = await setup(page);
  await chooseImage(page, 'a.jpg', true);
  await page.getByRole('textbox').first().fill('Slow camera push in');
  await expect(page.getByRole('button', { name: '16:9', exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: /Generate/i })
    .first()
    .click();
  await expect.poll(() => body()?.generation_type).toBe('i2v');
  expect(body()).not.toHaveProperty('aspect_ratio');
});
test('Wan R2V inserts at cursor and renumbers sources @cross-browser', async ({
  authenticatedPage: page,
}) => {
  await setup(page);
  for (const name of ['a.jpg', 'b.jpg', 'c.jpg']) await chooseImage(page, name);
  const prompt = page.getByRole('textbox').first();
  await prompt.fill('waves');
  for (let index = 0; index < 5; index++) await prompt.press('ArrowLeft');
  await page.getByRole('button', { name: 'Image 1', exact: true }).click();
  await expect(prompt).toHaveValue('Image 1 waves');
  await page.getByRole('button', { name: 'Remove source media', exact: true }).first().click();
  await expect(prompt).toHaveValue('[removed image] waves');
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeDisabled();
  await prompt.fill('waves');
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Image 3', exact: true })).toHaveCount(0);
});
test('Wan V2V disables WebM and caps extension duration @cross-browser', async ({
  authenticatedPage: page,
}) => {
  await setup(page, [
    makePricingRule({
      provider: 'alibaba',
      model: 'wan3.0-video',
      generation_type: 'v2v',
      token_cost: 0,
      input_token_cost: 2,
      per_second_token_cost: 3,
      video_resolution: '720p',
    }),
  ]);
  await page.getByRole('button', { name: 'Library', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'video', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /clip.webm/ })).toBeDisabled();
  await expect(dialog.getByText(/Use MOV, MP4/)).toBeVisible();
  await dialog.getByRole('button', { name: /clip.mp4/ }).click();
  await dialog.getByRole('button', { name: 'Add Selected Media' }).click();
  await expect(page.getByRole('slider')).toHaveAttribute('max', '18');
  await expect(page.getByRole('button', { name: /Generate/i }).first()).toContainText('◈ 53');
});
test('Jobs hide running Delete and restore a rejected deletion @cross-browser', async ({
  authenticatedPage: page,
}) => {
  await page.route('**/v1/providers', jsonRoute(provider));
  await page.route(
    '**/v1/jobs?**',
    jsonRoute({
      items: [
        makeUnifiedJobResponse({ id: 'running', status: 'running', name: 'Running Wan' }),
        makeUnifiedJobResponse({ id: 'done', status: 'completed', name: 'Race Wan' }),
      ],
      limit: 20,
      has_more: false,
      next_cursor: null,
    }),
  );
  await page.route('**/v1/jobs/done', (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: 'job_in_progress',
        message: 'Wait for this Wan job to finish',
        status_code: 409,
      },
    }),
  );
  await page.route(
    '**/v1/library/projects**',
    jsonRoute({ items: [], has_more: false, next_cursor: null, limit: 20 }),
  );
  await page.goto('/app/jobs');
  const running = page.getByRole('link').filter({ hasText: 'Running Wan' });
  await running.getByRole('button', { name: 'Job actions' }).click();
  await expect(running.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  const completed = page.getByRole('link').filter({ hasText: 'Race Wan' });
  await completed.getByRole('button', { name: 'Job actions' }).click();
  await completed.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Wait for this Wan job to finish')).toBeVisible();
  await expect(page.getByText('Race Wan')).toBeVisible();
});
test('Admin creates R2V rules for every resolution @cross-browser', async ({
  authenticatedPage: page,
}) => {
  await page.route(
    '**/v1/users/me',
    jsonRoute({
      id: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      display_name: 'Admin',
      subscription_tier: 'free',
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  );
  await page.route('**/v1/providers', jsonRoute(provider));
  await page.route(
    '**/v1/admin/models**',
    jsonRoute({
      items: [
        makeGenerationModel({ model_key: 'wan3.0-video', provider: 'alibaba', name: 'Wan 3.0' }),
      ],
    }),
  );
  await page.route(
    '**/v1/admin/users**',
    jsonRoute({ items: [], limit: 20, has_more: false, next_cursor: null }),
  );
  await page.route('**/v1/admin/roles**', jsonRoute({ roles: [], permissions: [] }));
  const rows: string[] = [];
  await page.route('**/v1/admin/pricing**', async (route) => {
    if (route.request().method() === 'POST') {
      rows.push(route.request().postDataJSON().video_resolution);
      await route.fulfill({ status: 201, json: makePricingRule() });
    } else await route.fulfill({ json: [] });
  });
  await page.route(
    '**/v1/library/projects**',
    jsonRoute({ items: [], has_more: false, next_cursor: null, limit: 20 }),
  );
  await page.goto('/app/admin');
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click();
  await page.getByRole('button', { name: 'Add Rule', exact: true }).click();
  await page.getByLabel('Provider', { exact: true }).selectOption('alibaba');
  await page.getByLabel('Generation Type').selectOption('r2v');
  await page.getByLabel('Model', { exact: true }).selectOption('wan3.0-video');
  await page.getByLabel('One rule per resolution').check();
  for (const res of ['480p', '720p', '1080p'])
    await page.getByLabel(res, { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => rows).toEqual(['480p', '720p', '1080p']);
  await expect(page.getByText('✓ Created', { exact: true })).toHaveCount(3);
});
