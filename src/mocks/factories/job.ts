import type { components } from '$lib/api/types';

type JobSummaryResponse = components['schemas']['JobSummaryResponse'];
type GrokJobResponse = components['schemas']['GrokJobResponse'];
type GrokJobStatusResponse = components['schemas']['GrokJobStatusResponse'];

export function makeJobSummary(overrides: Partial<JobSummaryResponse> = {}): JobSummaryResponse {
  return {
    id: 'job_mock_001',
    name: 'Mock generation',
    status: 'completed',
    generation_type: 't2i',
    prompt: 'A beautiful sunset over mountains',
    output_count: 1,
    created_at: '2025-01-01T00:00:00Z',
    completed_at: '2025-01-01T00:01:00Z',
    ...overrides,
  };
}

export function makeGrokJobResponse(overrides: Partial<GrokJobResponse> = {}): GrokJobResponse {
  return {
    job_id: 'job_mock_001',
    status: 'pending',
    name: 'Mock generation',
    model: 'aisha',
    generation_type: 't2i',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeGrokJobStatusResponse(
  overrides: Partial<GrokJobStatusResponse> = {},
): GrokJobStatusResponse {
  return {
    job_id: 'job_mock_001',
    status: 'completed',
    name: 'Mock generation',
    generation_type: 't2i',
    prompt: 'A beautiful sunset over mountains',
    created_at: '2025-01-01T00:00:00Z',
    completed_at: '2025-01-01T00:01:00Z',
    outputs: ['https://example.com/output-1.jpg'],
    ...overrides,
  };
}
