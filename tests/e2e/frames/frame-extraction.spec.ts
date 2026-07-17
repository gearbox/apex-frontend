import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const SOURCE_ID = 'output-video-001';
const DURATION_MS = 3_000;
const portraitVideo = readFileSync(
  new URL('../fixtures/media/frame-extraction-portrait.mp4', import.meta.url),
);
const previewImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlK8ZsAAAAASUVORK5CYII=',
  'base64',
);

const videoMedia = {
  media_type: 'video',
  original: {
    url: `/v1/content/outputs/${SOURCE_ID}`,
    width: 180,
    height: 320,
    content_type: 'video/mp4',
    size_bytes: portraitVideo.byteLength,
  },
  variants: [],
};

const galleryPage = {
  items: [
    {
      job_id: 'video-job-001',
      cover: videoMedia,
      badge: 'prompt',
      output_count: 1,
      generation_type: 't2v',
      model: 'grok-imagine-video',
      aspect_ratio: '9:16',
      prompt_snippet: 'A portrait video for frame extraction',
      created_at: '2026-07-17T10:00:00Z',
    },
  ],
  limit: 20,
  has_more: false,
  next_cursor: null,
};

const galleryDetail = {
  job_id: 'video-job-001',
  badge: 'prompt',
  input_media: null,
  prompt: 'A portrait video for frame extraction',
  negative_prompt: null,
  outputs: [
    {
      id: SOURCE_ID,
      output_index: 0,
      created_at: '2026-07-17T10:00:01Z',
      media: videoMedia,
    },
  ],
  media_type: 'video',
  model: 'grok-imagine-video',
  provider: 'grok',
  generation_type: 't2v',
  aspect_ratio: '9:16',
  token_cost: 10,
  created_at: '2026-07-17T10:00:00Z',
  completed_at: '2026-07-17T10:00:01Z',
  lineage: null,
};

function previewJob() {
  return {
    job_id: 'frame-preview-job',
    kind: 'preview',
    status: 'completed',
    created_at: '2026-07-17T10:00:00Z',
    started_at: '2026-07-17T10:00:01Z',
    finished_at: '2026-07-17T10:00:02Z',
    error: null,
    source: { type: 'output', id: SOURCE_ID },
    preview: {
      duration_ms: DURATION_MS,
      expires_in_seconds: 3600,
      frames: Array.from({ length: 6 }, (_, index) => ({
        index,
        timestamp_ms: index * 500,
        url: `https://frame-previews.example.test/${index}.webp`,
      })),
    },
    extracted: null,
  };
}

function extractingJob() {
  return {
    ...previewJob(),
    job_id: 'frame-extract-job',
    kind: 'extract',
    status: 'processing',
    preview: null,
  };
}

async function canvasSample(canvas: import('@playwright/test').Locator) {
  return canvas.evaluate((element) => {
    const preview = element as HTMLCanvasElement;
    const context = preview.getContext('2d');
    if (!context) throw new Error('2d context unavailable');
    const pixels = context.getImageData(
      Math.floor(preview.width / 2),
      Math.floor(preview.height / 2),
      1,
      1,
    ).data;
    const rect = preview.getBoundingClientRect();
    return {
      width: preview.width,
      height: preview.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
      pixel: Array.from(pixels),
    };
  });
}

test.describe('Frame extraction (real media regression)', () => {
  test('decodes a cross-origin H.264 portrait video, captures real canvas pixels, and freezes the submitted union', async ({
    authenticatedPage: page,
  }) => {
    let previewRequest: unknown;
    let extractionRequest: unknown;

    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(galleryPage));
    await page.route('**/v1/gallery/video-job-001', jsonRoute(galleryDetail));
    // The page is served from :4173 while toMediaSrc targets :8000. This
    // response header is required for the anonymous decoder to keep canvas
    // origin-clean; the test uses real media and real canvas APIs.
    await page.route('http://localhost:8000/v1/content/**', (route) => {
      const range = route.request().headers().range;
      const match = range?.match(/bytes=(\d+)-(\d*)/);
      const start = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : portraitVideo.length - 1;
      const body = portraitVideo.subarray(start, end + 1);
      return route.fulfill({
        status: match ? 206 : 200,
        contentType: 'video/mp4',
        headers: {
          'access-control-allow-origin': 'http://localhost:4173',
          'accept-ranges': 'bytes',
          'content-length': String(body.length),
          ...(match ? { 'content-range': `bytes ${start}-${end}/${portraitVideo.length}` } : {}),
        },
        body,
      });
    });
    await page.route('https://frame-previews.example.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: previewImage }),
    );
    await page.route('**/v1/frames/preview', (route) => {
      previewRequest = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: '{"job_id":"frame-preview-job","status":"queued"}',
      });
    });
    await page.route('**/v1/frames/extract', (route) => {
      extractionRequest = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: '{"job_id":"frame-extract-job","status":"queued"}',
      });
    });
    await page.route('**/v1/frames/jobs/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          route.request().url().includes('frame-extract-job') ? extractingJob() : previewJob(),
        ),
      }),
    );

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5_000 });
    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();
    await page
      .getByRole('dialog', { name: 'Image lightbox' })
      .getByRole('button', { name: 'Extract frames' })
      .click();

    const extractionDialog = page.getByRole('dialog', { name: 'Extract frames' });
    const scrubber = extractionDialog.getByRole('slider', { name: 'Frame timestamp' });
    const canvas = extractionDialog.locator('canvas');
    const addButton = extractionDialog.getByRole('button', { name: 'Add frame' });

    await expect(extractionDialog.getByRole('heading', { name: 'Automatic' })).toBeVisible();
    await expect
      .poll(() => previewRequest)
      .toEqual({ source_output_id: SOURCE_ID, frame_count: 6 });
    await expect(extractionDialog.getByRole('button', { name: /^Automatic:/ })).toHaveCount(6);
    await expect(addButton).toBeEnabled({ timeout: 8_000 });

    const initial = await canvasSample(canvas);
    expect(initial.width / initial.height).toBeCloseTo(9 / 16, 3);
    expect(initial.cssWidth / initial.cssHeight).toBeCloseTo(9 / 16, 1);
    expect(initial.pixel[0]).toBeGreaterThan(initial.pixel[1]);
    expect(initial.pixel[0]).toBeGreaterThan(initial.pixel[2]);

    await scrubber.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '1250';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // The seek is debounced, so the existing painted canvas must stay visible
    // rather than being cleared while the next decoded frame is pending.
    expect((await canvasSample(canvas)).pixel).toEqual(initial.pixel);
    await expect(addButton).toBeEnabled({ timeout: 8_000 });

    const middle = await canvasSample(canvas);
    expect(middle.pixel[1]).toBeGreaterThan(middle.pixel[0]);
    expect(middle.pixel[1]).toBeGreaterThan(middle.pixel[2]);

    // Repeating the exact timestamp must render without a synthetic seeked event.
    await scrubber.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '1250';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(addButton).toBeEnabled({ timeout: 8_000 });
    expect((await canvasSample(canvas)).pixel).toEqual(middle.pixel);

    await addButton.click();
    const manualCard = extractionDialog.getByRole('button', {
      name: 'Manually chosen frames: 00:01.250',
    });
    await expect(manualCard).toBeVisible();
    await expect(manualCard.locator('img')).toHaveJSProperty('naturalWidth', 180);
    await expect(manualCard).toHaveAttribute('aria-pressed', 'true');

    await extractionDialog.getByRole('button', { name: 'Automatic: 00:00.000' }).click();
    await extractionDialog.getByRole('button', { name: 'Extract frames' }).click();

    await expect
      .poll(() => extractionRequest)
      .toEqual({
        source_output_id: SOURCE_ID,
        timestamps_ms: [0, 1250],
      });
    await expect(
      extractionDialog.getByRole('button', { name: 'Automatic: 00:00.000' }),
    ).toBeDisabled();
    await expect(manualCard).toBeDisabled();
    await expect(scrubber).toBeDisabled();
    await expect(addButton).toBeDisabled();
  });
});
