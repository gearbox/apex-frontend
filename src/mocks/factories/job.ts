import type { components } from '$lib/api/types';

type JobCreatedResponse = components['schemas']['JobCreatedResponse'];
type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];
type JobOutputItem = components['schemas']['JobOutputItem'];

export function makeJobCreatedResponse(
  overrides: Partial<JobCreatedResponse> = {},
): JobCreatedResponse {
  return {
    job_id: 'job_mock_001',
    status: 'pending',
    name: 'Mock generation',
    model: 'grok-imagine-image',
    generation_type: 't2i',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeJobOutputItem(overrides: Partial<JobOutputItem> = {}): JobOutputItem {
  return {
    id: 'out_mock_001',
    url: 'https://example.com/output-1.jpg',
    content_type: 'image/jpeg',
    format: 'jpeg',
    size_bytes: 102400,
    output_index: 0,
    is_thumbnail: false,
    ...overrides,
  };
}

export function makeUnifiedJobResponse(
  overrides: Partial<UnifiedJobResponse> = {},
): UnifiedJobResponse {
  return {
    id: 'job_mock_001',
    name: 'Mock generation',
    status: 'completed',
    provider: 'grok',
    model: 'grok-imagine-image',
    generation_type: 't2i',
    prompt: 'A beautiful sunset over mountains',
    created_at: '2025-01-01T00:00:00Z',
    completed_at: '2025-01-01T00:01:00Z',
    outputs: [makeJobOutputItem()],
    token_cost: 10,
    ...overrides,
  };
}
