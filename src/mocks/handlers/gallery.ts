import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';
import {
  makeGalleryCursorPage,
  makeGalleryGroupDetail,
  makeGalleryOutputItem,
  makeGalleryLineage,
} from '../factories/gallery';

// Exported failure variant for testing
export const contentDeleteNotFoundHandler = http.delete(
  `${BASE}/v1/content/:content_id`,
  () =>
    HttpResponse.json(
      { error: 'not_found', message: 'Content not found', status_code: 404 },
      { status: 404 },
    ),
);

export const galleryHandlers = [
  // Unified content delete (outputs and uploads)
  http.delete(`${BASE}/v1/content/:content_id`, () => new HttpResponse(null, { status: 204 })),

  // Gallery list
  http.get(`${BASE}/v1/gallery`, ({ request }) => {
    const url = new URL(request.url);
    const mediaType = url.searchParams.get('media_type');
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const cursor = url.searchParams.get('cursor');

    // Simulate second page being empty (for testing finite scroll)
    if (cursor) {
      return HttpResponse.json({
        items: [],
        limit,
        has_more: false,
        next_cursor: null,
      });
    }

    // Build items — filter by media_type if present
    const baseItems = makeGalleryCursorPage(6, {}, true);

    if (mediaType === 'video') {
      return HttpResponse.json(
        makeGalleryCursorPage(2, {
          media_type: 'video',
          badge: 'prompt',
          generation_type: 't2v',
          video_url: '/v1/content/outputs/vid_mock_001',
        }),
      );
    }
    if (mediaType === 'image') {
      // Mix t2i and i2i items; for i2i the backend sets cover_url to the source image
      const t2iItems = makeGalleryCursorPage(3);
      const i2iItems = makeGalleryCursorPage(1, {
        job_id: 'job_mock_i2i',
        cover_url: '/v1/content/uploads/upload_mock_001', // source image — backend bug
        badge: 'image',
        generation_type: 'i2i',
        prompt_snippet: 'Stylised version of the source',
      });
      return HttpResponse.json({
        items: [...t2iItems.items, ...i2iItems.items],
        limit: 20,
        has_more: false,
        next_cursor: null,
      });
    }

    return HttpResponse.json(baseItems);
  }),

  // Gallery detail
  http.get(`${BASE}/v1/gallery/:job_id`, ({ params }) => {
    const jobId = params.job_id as string;

    // Simulate an i2i job with lineage for specific mock ID
    if (jobId === 'job_mock_i2i') {
      return HttpResponse.json(
        makeGalleryGroupDetail({
          job_id: jobId,
          badge: 'image',
          input_image_url: '/v1/content/uploads/upload_mock_001',
          generation_type: 'i2i',
          aspect_ratio: '16:9',
          lineage: makeGalleryLineage({
            source_type: 'upload',
            source_upload_id: 'upload_mock_001',
            source_job_id: null,
            source_job_name: null,
            source_output_id: null,
          }),
          outputs: [
            makeGalleryOutputItem({ id: 'out_i2i_001', url: '/v1/content/outputs/out_i2i_001' }),
            makeGalleryOutputItem({
              id: 'out_i2i_002',
              url: '/v1/content/outputs/out_i2i_002',
              output_index: 1,
            }),
          ],
        }),
      );
    }

    // Default: t2i with no lineage
    return HttpResponse.json(
      makeGalleryGroupDetail({
        job_id: jobId,
        outputs: [
          makeGalleryOutputItem({
            id: `out_${jobId}_001`,
            url: `/v1/content/outputs/out_${jobId}_001`,
          }),
        ],
      }),
    );
  }),
];
