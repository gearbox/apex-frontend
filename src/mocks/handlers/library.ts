import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';
import {
  makeLibraryCursorPage,
  makeLibraryAssetDetail,
  makeLibraryGroupDetail,
  makeLibraryOutputItem,
  makeLibraryGroupLineage,
} from '../factories/library';
import { makeVideoMediaObject, makeStandardImageMedia, makeMediaObject } from '../factories/media';

// Exported failure variant for testing
export const libraryAssetNotFoundHandler = http.delete(`${BASE}/v1/library/assets/:asset_ref`, () =>
  HttpResponse.json(
    { error: 'not_found', message: 'Library asset not found', status_code: 404 },
    { status: 404 },
  ),
);

export const libraryHandlers = [
  // List
  http.get(`${BASE}/v1/library`, ({ request }) => {
    const url = new URL(request.url);
    const mediaType = url.searchParams.get('media_type');
    const cursor = url.searchParams.get('cursor');

    if (cursor) {
      return HttpResponse.json({ items: [], limit: 30, has_more: false, next_cursor: null });
    }

    if (mediaType === 'video') {
      return HttpResponse.json(
        makeLibraryCursorPage(2, {
          media: makeVideoMediaObject(),
          source: 'output',
          duration_ms: 4500,
        }),
      );
    }

    return HttpResponse.json(makeLibraryCursorPage(6, {}, true));
  }),

  // Asset detail
  http.get(`${BASE}/v1/library/assets/:asset_ref`, ({ params }) => {
    const assetRef = params.asset_ref as string;
    return HttpResponse.json(
      makeLibraryAssetDetail({
        asset_ref: assetRef,
        media: makeStandardImageMedia('out_mock_001'),
      }),
    );
  }),

  // Group detail
  http.get(`${BASE}/v1/library/groups/:job_id`, ({ params }) => {
    const jobId = params.job_id as string;

    if (jobId === 'job_mock_i2i') {
      return HttpResponse.json(
        makeLibraryGroupDetail({
          job_id: jobId,
          badge: 'image',
          input_media: makeMediaObject({
            original: {
              url: '/v1/content/uploads/upload_mock_001',
              width: 1024,
              height: 768,
              content_type: 'image/jpeg',
              size_bytes: 500000,
            },
          }),
          generation_type: 'i2i',
          aspect_ratio: '16:9',
          lineage: makeLibraryGroupLineage({
            source_type: 'upload',
            source_upload_id: 'upload_mock_001',
            source_job_id: null,
            source_job_name: null,
            source_output_id: null,
          }),
          outputs: [
            makeLibraryOutputItem({
              id: 'out_i2i_001',
              asset_ref: 'output:out_i2i_001',
              media: makeStandardImageMedia('out_i2i_001'),
            }),
            makeLibraryOutputItem({
              id: 'out_i2i_002',
              asset_ref: 'output:out_i2i_002',
              output_index: 1,
              media: makeStandardImageMedia('out_i2i_002'),
            }),
          ],
        }),
      );
    }

    return HttpResponse.json(
      makeLibraryGroupDetail({
        job_id: jobId,
        outputs: [
          makeLibraryOutputItem({
            id: `out_${jobId}_001`,
            asset_ref: `output:out_${jobId}_001`,
            media: makeStandardImageMedia(`out_${jobId}_001`),
          }),
        ],
      }),
    );
  }),

  // Favorite toggle
  http.put(
    `${BASE}/v1/library/assets/:asset_ref/favorite`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete(
    `${BASE}/v1/library/assets/:asset_ref/favorite`,
    () => new HttpResponse(null, { status: 204 }),
  ),

  // Rename
  http.patch(`${BASE}/v1/library/assets/:asset_ref`, async ({ params, request }) => {
    const body = (await request.json()) as { display_title?: string | null };
    return HttpResponse.json(
      makeLibraryAssetDetail({
        asset_ref: params.asset_ref as string,
        display_title: body.display_title ?? null,
      }),
    );
  }),

  // Delete
  http.delete(
    `${BASE}/v1/library/assets/:asset_ref`,
    () => new HttpResponse(null, { status: 204 }),
  ),
];
