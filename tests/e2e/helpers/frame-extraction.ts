import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { jsonRoute } from '../helpers/api';

export const SOURCE_ID = 'c0000000-0000-4000-8000-000000000001';
export const DURATION_MS = 3_000;
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
    url: `/v1/content/uploads/${SOURCE_ID}`,
    width: 180,
    height: 320,
    content_type: 'video/mp4',
    // Disable the parent viewer's independent save/share prewarm; extraction has no video size cap.
    size_bytes: 100 * 1024 * 1024,
    duration_ms: DURATION_MS,
  },
  variants: [],
};

const libraryUploadItem = {
  asset_ref: `upload:${SOURCE_ID}`,
  source: 'upload',
  media: videoMedia,
  created_at: '2026-07-17T10:00:00Z',
  expires_at: '2026-08-17T10:00:00Z',
  display_title: null,
  original_filename: 'portrait-frame-source.mp4',
  display_filename: 'portrait-frame-source.mp4',
  is_favorite: false,
  duration_ms: DURATION_MS,
  job_id: null,
  output_count: null,
  model: null,
  generation_type: null,
  available_actions: ['extract_frame', 'download', 'favorite', 'delete'],
  tags: [],
};

const libraryPage = {
  items: [libraryUploadItem],
  limit: 30,
  has_more: false,
  next_cursor: null,
};

const libraryAssetDetail = {
  ...libraryUploadItem,
  prompt: null,
  negative_prompt: null,
  provider: null,
  aspect_ratio: null,
  token_cost: null,
  completed_at: null,
  lineage: null,
  descendants: { job_count: 0, frame_count: 0 },
};

export async function canvasSample(canvas: import('@playwright/test').Locator) {
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

export async function setupFrameExtraction(
  page: import('@playwright/test').Page,
  corrupt = false,
  unavailable = false,
) {
  const mediaRequests: { url: string; range?: string; authorization?: string; resource: string }[] =
    [];
  const uploads: { source: string; timestamp: string }[] = [];
  const detail = unavailable
    ? {
        ...libraryAssetDetail,
        media: { ...videoMedia, original: { ...videoMedia.original, duration_ms: null } },
      }
    : libraryAssetDetail;
  await page.route(
    (url) => url.pathname === '/v1/library',
    jsonRoute({ ...libraryPage, items: [detail] }),
  );
  await page.route('**/v1/library/assets/**', jsonRoute(detail));
  await page.route(
    '**/v1/providers',
    jsonRoute({
      providers: [
        {
          name: 'Grok',
          provider: 'grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            {
              model_key: 'grok-imagine-image',
              name: 'Grok Imagine',
              description: 'Image generation',
              is_enabled: true,
              generation_modes: {
                t2i: { source_media: null },
                i2i: { source_media: { min: 1, max: 4, media_types: ['image'], roles: null } },
              },
              max_images: 4,
              max_prompt_length: 4096,
              supports_negative_prompt: false,
              unsupported_parameters: [],
              aspect_ratios: ['1:1'],
              requires_age_verification: false,
              image: { edit_aspect_ratios: [] },
              video: null,
            },
          ],
        },
      ],
      user_context: { subscription_tier: 'free' },
    }),
  );
  await page.route(
    '**/v1/storage/stats',
    jsonRoute({
      upload_count: 1,
      output_count: 0,
      total_bytes: portraitVideo.byteLength,
      total_mb: 1,
    }),
  );
  await page.context().addCookies([
    {
      name: 'apex_content',
      value: 'e2e-content-cookie',
      domain: 'localhost',
      path: '/v1/content',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  await page.route('http://localhost:8000/v1/content/**', async (route) => {
    const request = route.request();
    const headers = await request.allHeaders();
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:4173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers':
            headers['access-control-request-headers'] ?? 'Range, X-Product-Id',
          vary: 'Origin',
        },
      });
    const isVideo = new URL(request.url()).pathname.endsWith(SOURCE_ID);
    if (!isVideo)
      return route.fulfill({
        contentType: 'image/png',
        body: previewImage,
        headers: {
          'access-control-allow-origin': 'http://localhost:4173',
          'access-control-allow-credentials': 'true',
          vary: 'Origin',
        },
      });
    mediaRequests.push({
      url: request.url(),
      range: headers.range,
      authorization: headers.authorization,
      resource: request.resourceType(),
    });
    // The corrupt-payload scenario proves decode classification for reachable bytes.
    if (
      !corrupt &&
      (headers.authorization || !headers.cookie?.includes('apex_content=e2e-content-cookie'))
    )
      return route.fulfill({ status: 401, body: '{"error":"unauthorized"}' });
    const bytes = corrupt ? Buffer.from('This is deliberately not a video.') : portraitVideo;
    const match = headers.range?.match(/bytes=(\d+)-(\d*)/);
    const start = match ? Number(match[1]) : 0;
    const end = Math.min(match?.[2] ? Number(match[2]) : bytes.length - 1, bytes.length - 1);
    const body = bytes.subarray(start, end + 1);
    return route.fulfill({
      status: match ? 206 : 200,
      contentType: 'video/mp4',
      body,
      headers: {
        'access-control-allow-origin': 'http://localhost:4173',
        'access-control-allow-credentials': 'true',
        'accept-ranges': 'bytes',
        'content-length': String(body.length),
        vary: 'Origin',
        ...(match ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}),
      },
    });
  });
  await page.route('**/v1/storage/upload', async (route) => {
    const body = route.request().postDataBuffer()!.toString('latin1');
    const field = (name: string) =>
      body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1] ?? '';
    uploads.push({ source: field('source_asset_ref'), timestamp: field('source_timestamp_ms') });
    const id = `c0000000-0000-4000-8000-${String(uploads.length + 1).padStart(12, '0')}`;
    return jsonRoute(
      {
        id,
        filename: 'frame.png',
        created_at: '2026-10-06T00:00:00Z',
        expires_at: '2026-11-06T00:00:00Z',
        media: {
          media_type: 'image',
          variants: [],
          original: {
            url: `/v1/content/uploads/${id}`,
            width: 180,
            height: 320,
            content_type: 'image/png',
            size_bytes: 100,
          },
        },
      },
      201,
    )(route);
  });
  await page.goto('/app/library');
  await page.getByRole('button', { name: /portrait-frame-source\.mp4/ }).click();
  const lightbox = page.getByRole('dialog', { name: 'Asset details' });
  await lightbox.getByRole('button', { name: 'Extract frames' }).click();
  return {
    dialog: page.getByRole('dialog', { name: 'Extract frames' }),
    mediaRequests,
    uploads,
  };
}
