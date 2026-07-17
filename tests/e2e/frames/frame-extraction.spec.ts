import { Buffer } from 'node:buffer';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const SOURCE_ID = 'output-video-001';
const DURATION_MS = 6_000;

const videoMedia = {
  media_type: 'video',
  original: {
    url: `/v1/content/outputs/${SOURCE_ID}`,
    width: 720,
    height: 1280,
    content_type: 'video/mp4',
    size_bytes: 5_000_000,
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
        timestamp_ms: index * 1_000,
        url: `https://frame-previews.example.test/${index}.webp`,
      })),
    },
    extracted: null,
  };
}

function extractedJob() {
  return {
    ...previewJob(),
    job_id: 'frame-extract-job',
    kind: 'extract',
    preview: null,
    extracted: { frames: [] },
  };
}

test.describe('Frame extraction', () => {
  test('keeps a decoded preview, adds a manual portrait frame, and submits the selected union', async ({
    authenticatedPage: page,
  }) => {
    let previewRequest: unknown;
    let extractionRequest: unknown;

    // Deterministic media primitives let this exercise the live browser UI in
    // Chromium and WebKit without depending on a codec installed on the host.
    await page.addInitScript(() => {
      Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
        configurable: true,
        get: () => HTMLMediaElement.HAVE_METADATA,
      });
      Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
        configurable: true,
        get: () => 720,
      });
      Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
        configurable: true,
        get: () => 1280,
      });
      Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
        configurable: true,
        get: () => 0,
        set(this: HTMLMediaElement) {
          queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
        },
      });
      Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
        configurable: true,
        value: (callback: (now: number, metadata: object) => void) => {
          queueMicrotask(() => callback(performance.now(), {}));
          return 1;
        },
      });
      Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
        configurable: true,
        value: () => undefined,
      });
      HTMLCanvasElement.prototype.getContext = () => ({ drawImage: () => undefined }) as never;
      HTMLCanvasElement.prototype.toBlob = (callback) => {
        callback(new Blob(['frame'], { type: 'image/webp' }));
      };
    });

    await page.route((url) => url.pathname === '/v1/gallery', jsonRoute(galleryPage));
    await page.route('**/v1/gallery/video-job-001', jsonRoute(galleryDetail));
    await page.route('**/v1/content/**', (route) =>
      route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('video') }),
    );
    await page.route('https://frame-previews.example.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from('frame') }),
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
          route.request().url().includes('frame-extract-job') ? extractedJob() : previewJob(),
        ),
      }),
    );

    await page.goto('/app/gallery');
    await expect(page.getByText(/loaded/i)).toBeVisible({ timeout: 5000 });
    await page.locator('[class*="grid"]').locator('button, [role="button"]').first().click();
    await page
      .getByRole('dialog', { name: 'Image lightbox' })
      .getByRole('button', {
        name: 'Extract frames',
      })
      .click();

    const extractionDialog = page.getByRole('dialog', { name: 'Extract frames' });

    await expect(extractionDialog.getByRole('heading', { name: 'Automatic' })).toBeVisible();
    await expect
      .poll(() => previewRequest)
      .toEqual({ source_output_id: SOURCE_ID, frame_count: 6 });
    await expect(page.getByRole('button', { name: /^Automatic:/ })).toHaveCount(6);

    const scrubber = page.getByRole('slider', { name: 'Frame timestamp' });
    await scrubber.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '1500';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.getByRole('button', { name: 'Add frame' })).toBeEnabled();
    await page.getByRole('button', { name: 'Add frame' }).click();

    const manualCard = page.getByRole('button', {
      name: 'Manually chosen frames: 00:01.500',
    });
    await expect(manualCard).toBeVisible();
    await expect(manualCard).toHaveAttribute('aria-pressed', 'true');
    await expect(manualCard.locator('img')).toHaveClass(/object-contain/);
    await page.getByRole('button', { name: 'Automatic: 00:00.000' }).click();
    await extractionDialog.getByRole('button', { name: 'Extract frames' }).click();

    await expect
      .poll(() => extractionRequest)
      .toEqual({
        source_output_id: SOURCE_ID,
        timestamps_ms: [0, 1500],
      });
  });
});
