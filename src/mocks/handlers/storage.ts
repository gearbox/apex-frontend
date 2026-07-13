import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';
import { makeMediaObject } from '../factories/gallery';

function makeUploadMediaObject(uploadId: string) {
  return makeMediaObject({
    original: {
      url: `/v1/content/uploads/${uploadId}`,
      width: 1024,
      height: 768,
      content_type: 'image/jpeg',
      size_bytes: 500000,
    },
    variants: [
      { label: 'sm', width: 150, height: 113, url: `/v1/content/uploads/${uploadId}_sm` },
      { label: 'md', width: 512, height: 384, url: `/v1/content/uploads/${uploadId}_md` },
    ],
  });
}

function makeVideoUploadMediaObject(uploadId: string) {
  return makeMediaObject({
    media_type: 'video',
    original: {
      url: `/v1/content/uploads/${uploadId}`,
      width: null,
      height: null,
      content_type: 'video/mp4',
      size_bytes: 5_000_000,
    },
    // Video poster generation is best-effort, so callers must support no variants.
    variants: [],
  });
}

export const storageHandlers = [
  // Storage stats
  http.get(`${BASE}/v1/storage/stats`, () =>
    HttpResponse.json({ upload_count: 6, output_count: 14, total_bytes: 3145728, total_mb: 3 }),
  ),

  // Upload list — cursor-based pagination
  http.get(`${BASE}/v1/storage/uploads`, ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const cursor = url.searchParams.get('cursor');

    if (cursor) {
      return HttpResponse.json({ items: [], limit, has_more: false, next_cursor: null });
    }

    const items = Array.from({ length: Math.min(limit, 6) }, (_, i) => {
      const id = `upload_mock_${String(i + 1).padStart(3, '0')}`;
      return {
        id,
        filename: `image_${i + 1}.jpg`,
        created_at: new Date(Date.now() - i * 86400000).toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        media: makeUploadMediaObject(id),
      };
    });

    return HttpResponse.json({ items, limit, has_more: false, next_cursor: null });
  }),

  // File upload — video fixture intentionally has no poster variants.
  // Do not read request.formData() here: MSW's Node interceptor can hang on
  // jsdom File bodies. Endpoint-specific tests override this handler when they
  // need to assert a particular image or video response.
  http.post(`${BASE}/v1/storage/upload`, () => {
    const uploadId = 'upload_new_video_001';
    return HttpResponse.json(
      {
        id: uploadId,
        filename: 'uploaded.mp4',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        media: makeVideoUploadMediaObject(uploadId),
      },
      { status: 201 },
    );
  }),

  // Content proxy stubs for upload thumbnails
  http.get(
    `${BASE}/v1/content/uploads/:image_id`,
    () =>
      new HttpResponse(new Uint8Array([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'private, max-age=10800, immutable',
        },
      }),
  ),

  // Content proxy stubs for output images
  http.get(
    `${BASE}/v1/content/outputs/:output_id`,
    () =>
      new HttpResponse(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=10800, immutable',
        },
      }),
  ),
];
