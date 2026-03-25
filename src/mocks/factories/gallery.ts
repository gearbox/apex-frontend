import type { components } from '$lib/api/types';

type GalleryGridItem = components['schemas']['GalleryGridItem'];
type GalleryGroupDetail = components['schemas']['GalleryGroupDetail'];
type GalleryOutputItem = components['schemas']['GalleryOutputItem'];
type GalleryLineage = components['schemas']['GalleryLineage'];

export function makeGalleryGridItem(overrides: Partial<GalleryGridItem> = {}): GalleryGridItem {
  return {
    job_id: 'job_mock_001',
    cover_url: '/v1/content/outputs/out_mock_001',
    video_url: null,
    badge: 'prompt',
    media_type: 'image',
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
    url: '/v1/content/outputs/out_mock_001',
    thumbnail_url: null,
    content_type: 'image/jpeg',
    media_type: 'image',
    format: 'jpeg',
    size_bytes: 102400,
    output_index: 0,
    created_at: '2025-06-01T12:01:00Z',
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
    input_image_url: null,
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
      cover_url: `/v1/content/outputs/out_mock_${String(i + 1).padStart(3, '0')}`,
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
