import type { components } from '$lib/api/types';
import { makeMediaObject } from './media';

type LibraryAssetItem = components['schemas']['LibraryAssetItem'];
type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];
type LibraryOutputItem = components['schemas']['LibraryOutputItem'];
type LibraryLineage = components['schemas']['LibraryLineage'];
type LibraryGroupLineage = components['schemas']['LibraryGroupLineage'];
type LibraryDescendants = components['schemas']['LibraryDescendants'];

const ALL_ACTIONS = [
  'remix',
  'create_variation',
  'animate',
  'use_as_reference',
  'use_as_first_frame',
  'use_as_last_frame',
  'view_settings',
  'reproduce',
  'favorite',
  'rename',
  'download',
  'delete',
] as const;

export function makeLibraryAssetItem(overrides: Partial<LibraryAssetItem> = {}): LibraryAssetItem {
  return {
    asset_ref: 'output:out_mock_001',
    source: 'output',
    media: makeMediaObject(),
    created_at: '2025-06-01T12:00:00Z',
    expires_at: '2025-07-01T12:00:00Z',
    display_title: null,
    original_filename: null,
    is_favorite: false,
    duration_ms: null,
    job_id: 'job_mock_001',
    output_count: 1,
    model: 'grok-imagine-image',
    generation_type: 't2i',
    available_actions: [...ALL_ACTIONS],
    tags: [],
    ...overrides,
  };
}

export function makeLibraryAssetDetail(
  overrides: Partial<LibraryAssetDetail> = {},
): LibraryAssetDetail {
  return {
    ...makeLibraryAssetItem(),
    prompt: 'A beautiful sunset over mountains with golden light',
    negative_prompt: null,
    provider: 'grok',
    aspect_ratio: '1:1',
    token_cost: 10,
    completed_at: '2025-06-01T12:01:00Z',
    lineage: null,
    descendants: makeLibraryDescendants(),
    ...overrides,
  };
}

export function makeLibraryLineage(overrides: Partial<LibraryLineage> = {}): LibraryLineage {
  return {
    source_asset_ref: null,
    source_job_id: null,
    source_timestamp_ms: null,
    ...overrides,
  };
}

export function makeLibraryDescendants(
  overrides: Partial<LibraryDescendants> = {},
): LibraryDescendants {
  return {
    job_count: 0,
    frame_count: 0,
    ...overrides,
  };
}

export function makeLibraryOutputItem(
  overrides: Partial<LibraryOutputItem> = {},
): LibraryOutputItem {
  return {
    id: 'out_mock_001',
    asset_ref: 'output:out_mock_001',
    output_index: 0,
    created_at: '2025-06-01T12:01:00Z',
    expires_at: '2025-07-01T12:00:00Z',
    media: makeMediaObject(),
    ...overrides,
  };
}

export function makeLibraryGroupLineage(
  overrides: Partial<LibraryGroupLineage> = {},
): LibraryGroupLineage {
  return {
    source_type: 'output',
    source_upload_id: null,
    source_job_id: 'job_mock_parent',
    source_job_name: 'Parent generation',
    source_output_id: 'out_mock_parent_001',
    ...overrides,
  };
}

export function makeLibraryGroupDetail(
  overrides: Partial<LibraryGroupDetail> = {},
): LibraryGroupDetail {
  return {
    job_id: 'job_mock_001',
    badge: 'prompt',
    input_media: null,
    prompt: 'A beautiful sunset over mountains with golden light streaming through clouds',
    negative_prompt: null,
    outputs: [makeLibraryOutputItem()],
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

export function makeLibraryCursorPage(
  count = 3,
  overrides: Partial<LibraryAssetItem> = {},
  hasMore = false,
) {
  const items = Array.from({ length: count }, (_, i) =>
    makeLibraryAssetItem({
      asset_ref: `output:out_mock_${String(i + 1).padStart(3, '0')}`,
      job_id: `job_mock_${String(i + 1).padStart(3, '0')}`,
      media: makeMediaObject(),
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      ...overrides,
    }),
  );
  return {
    items,
    limit: 30,
    has_more: hasMore,
    next_cursor: hasMore ? 'eyJtb2NrIjoiY3Vyc29yIn0=' : null,
  };
}
