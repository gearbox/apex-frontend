import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';

export const storageHandlers = [
  // Upload list — cursor-based pagination
  http.get(`${BASE}/v1/storage/uploads`, ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const cursor = url.searchParams.get('cursor');

    // Second page: empty
    if (cursor) {
      return HttpResponse.json({
        items: [],
        limit,
        has_more: false,
        next_cursor: null,
      });
    }

    const items = Array.from({ length: Math.min(limit, 6) }, (_, i) => ({
      id: `upload_mock_${String(i + 1).padStart(3, '0')}`,
      filename: `image_${i + 1}.jpg`,
      content_type: 'image/jpeg',
      size_bytes: 500000 + i * 100000,
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    }));

    return HttpResponse.json({
      items,
      limit,
      has_more: false,
      next_cursor: null,
    });
  }),

  // Single upload access
  http.get(`${BASE}/v1/storage/uploads/:image_id`, ({ params }) =>
    HttpResponse.json({
      id: params.image_id,
      storage_key: `users/mock/uploads/${params.image_id}.jpg`,
      presigned_url: `https://example.com/presigned/${params.image_id}.jpg`,
      content_type: 'image/jpeg',
      size_bytes: 500000,
      expires_in_seconds: 3600,
    }),
  ),

  // File upload
  http.post(`${BASE}/v1/storage/upload`, () =>
    HttpResponse.json(
      {
        id: 'upload_new_001',
        storage_key: 'users/mock/uploads/upload_new_001.jpg',
        filename: 'uploaded.jpg',
        content_type: 'image/jpeg',
        size_bytes: 500000,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      { status: 201 },
    ),
  ),

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
];
