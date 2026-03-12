import type { components } from '$lib/api/types';
import { makeJobSummary } from './job';

type JobSummaryResponse = components['schemas']['JobSummaryResponse'];

export function makeGalleryPage(
  count = 3,
  total?: number,
  overrides: Partial<JobSummaryResponse> = {},
): { items: JobSummaryResponse[]; total: number } {
  const items = Array.from({ length: count }, (_, i) =>
    makeJobSummary({ id: `job_mock_${String(i + 1).padStart(3, '0')}`, ...overrides }),
  );
  return { items, total: total ?? count };
}
