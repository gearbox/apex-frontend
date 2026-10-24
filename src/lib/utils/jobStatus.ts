import type { components } from '$lib/api/types';
type JobStatus = components['schemas']['JobStatus'];
export const IN_FLIGHT_JOB_STATUSES = [
  'pending',
  'queued',
  'running',
] as const satisfies readonly JobStatus[];
export function isInFlight(status: JobStatus): boolean {
  return IN_FLIGHT_JOB_STATUSES.some((candidate) => candidate === status);
}
