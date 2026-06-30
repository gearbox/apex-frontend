import type { components } from '$lib/api/types';

type GalleryGridItem = components['schemas']['GalleryGridItem'];
type GalleryGroupDetail = components['schemas']['GalleryGroupDetail'];
type GalleryOutputItem = components['schemas']['GalleryOutputItem'];
type GalleryLineage = components['schemas']['GalleryLineage'];
type MediaObject = components['schemas']['MediaObject'];
type ImageVariant = components['schemas']['ImageVariant'];

/* ─── MediaObject factories ─── */

export function makeImageVariant(overrides: Partial<ImageVariant> = {}): ImageVariant {
  return {
    label: 'sm',
    width: 150,
    height: 150,
    url: '/v1/content/outputs/variant_sm_001',
    ...overrides,
  };
}

export function makeMediaObject(overrides: Partial<MediaObject> = {}): MediaObject {
  return {
    media_type: 'image',
    original: {
      url: '/v1/content/outputs/out_mock_001',
      width: 1024,
      height: 1024,
      content_type: 'image/png',
      size_bytes: 102400,
    },
    variants: [
      makeImageVariant({
        label: 'sm',
        width: 150,
        height: 150,
        url: '/v1/content/outputs/out_mock_001_sm',
      }),
      makeImageVariant({
        label: 'md',
        width: 512,
        height: 512,
        url: '/v1/content/outputs/out_mock_001_md',
      }),
    ],
    ...overrides,
  };
}

export function makeVideoMediaObject(overrides: Partial<MediaObject> = {}): MediaObject {
  return {
    media_type: 'video',
    original: {
      url: '/v1/content/outputs/vid_mock_001',
      width: null,
      height: null,
      content_type: 'video/mp4',
      size_bytes: 5000000,
    },
    variants: [
      makeImageVariant({
        label: 'sm',
        width: 150,
        height: 84,
        url: '/v1/content/outputs/vid_mock_001_poster_sm',
      }),
      makeImageVariant({
        label: 'md',
        width: 512,
        height: 288,
        url: '/v1/content/outputs/vid_mock_001_poster_md',
      }),
    ],
    ...overrides,
  };
}

/** MediaObject with no variants — tests legacy/empty-variant rendering */
export function makeEmptyVariantsMediaObject(): MediaObject {
  return {
    media_type: 'image',
    original: {
      url: '/v1/content/outputs/out_legacy_001',
      width: 800,
      height: 600,
      content_type: 'image/jpeg',
      size_bytes: 50000,
    },
    variants: [],
  };
}

/* ─── Gallery factories ─── */

export function makeGalleryGridItem(overrides: Partial<GalleryGridItem> = {}): GalleryGridItem {
  return {
    job_id: 'job_mock_001',
    cover: makeMediaObject(),
    badge: 'prompt',
    output_count: 1,
    generation_type: 't2i',
    model: 'grok-imagine-image',
    aspect_ratio: '1:1',
    prompt_snippet: 'A beautiful sunset over mountains with golden light',
    created_at: '2025-06-01T12:00:00Z',
    ...overrides,
  };
}

export function makeGalleryOutputItem(
  overrides: Partial<GalleryOutputItem> = {},
): GalleryOutputItem {
  return {
    id: 'out_mock_001',
    output_index: 0,
    created_at: '2025-06-01T12:01:00Z',
    media: makeMediaObject(),
    ...overrides,
  };
}

export function makeGalleryLineage(overrides: Partial<GalleryLineage> = {}): GalleryLineage {
  return {
    source_type: 'generation',
    source_upload_id: null,
    source_job_id: 'job_mock_parent',
    source_job_name: 'Parent generation',
    source_output_id: 'out_mock_parent_001',
    ...overrides,
  };
}

export function makeGalleryGroupDetail(
  overrides: Partial<GalleryGroupDetail> = {},
): GalleryGroupDetail {
  return {
    job_id: 'job_mock_001',
    badge: 'prompt',
    input_media: null,
    prompt: 'A beautiful sunset over mountains with golden light streaming through clouds',
    negative_prompt: null,
    outputs: [makeGalleryOutputItem()],
    media_type: 'image',
    model: 'grok-imagine-image',
    provider: 'grok',
    generation_type: 't2i',
    aspect_ratio: '1:1',
    token_cost: 10,
    created_at: '2025-06-01T12:00:00Z',
    completed_at: '2025-06-01T12:01:00Z',
    lineage: null,
    ...overrides,
  };
}

export function makeGalleryCursorPage(
  count = 3,
  overrides: Partial<GalleryGridItem> = {},
  hasMore = false,
) {
  const items = Array.from({ length: count }, (_, i) =>
    makeGalleryGridItem({
      job_id: `job_mock_${String(i + 1).padStart(3, '0')}`,
      cover: makeMediaObject({
        original: {
          url: `/v1/content/outputs/out_mock_${String(i + 1).padStart(3, '0')}`,
          width: 1024,
          height: 1024,
          content_type: 'image/png',
          size_bytes: 102400,
        },
        variants: [
          makeImageVariant({
            label: 'sm',
            width: 150,
            height: 150,
            url: `/v1/content/outputs/out_mock_${String(i + 1).padStart(3, '0')}_sm`,
          }),
          makeImageVariant({
            label: 'md',
            width: 512,
            height: 512,
            url: `/v1/content/outputs/out_mock_${String(i + 1).padStart(3, '0')}_md`,
          }),
        ],
      }),
      prompt_snippet: `Mock generation prompt ${i + 1}`,
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      ...overrides,
    }),
  );
  return {
    items,
    limit: 20,
    has_more: hasMore,
    next_cursor: hasMore ? 'eyJtb2NrIjoiY3Vyc29yIn0=' : null,
  };
}
