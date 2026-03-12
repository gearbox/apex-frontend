// Pure service — no Svelte dependency. Testable in isolation.
import apiClient from '$lib/api/client';
import { POLL_INTERVAL_MS, TERMINAL_JOB_STATUSES } from '$lib/utils/constants';
import type { components } from '$lib/api/types';

type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];

export interface PollOptions {
  jobId: string;
  intervalMs?: number;
  onUpdate: (job: UnifiedJobResponse) => void;
  onComplete: (job: UnifiedJobResponse) => void;
  onError: (error: Error) => void;
}

export function createJobPoller(options: PollOptions): { stop: () => void } {
  const { jobId, intervalMs = POLL_INTERVAL_MS, onUpdate, onComplete, onError } = options;

  let stopped = false;
  let retryCount = 0;
  const MAX_RETRIES = 5;
  let currentDelay = intervalMs;

  async function poll() {
    if (stopped) return;

    try {
      const { data, error } = await apiClient.GET('/v1/jobs/{job_id}', {
        params: { path: { job_id: jobId } },
      });

      if (stopped) return;

      if (error || !data) {
        throw new Error('Failed to fetch job status');
      }

      retryCount = 0;
      currentDelay = intervalMs;

      const terminalStatuses: readonly string[] = TERMINAL_JOB_STATUSES;

      if (terminalStatuses.includes(data.status)) {
        if (data.status === 'completed') {
          onComplete(data);
        } else {
          onError(new Error(`Job ended with status: ${data.status}`));
        }
        return;
      }

      onUpdate(data);

      if (!stopped) {
        setTimeout(poll, currentDelay);
      }
    } catch {
      if (stopped) return;

      retryCount++;
      if (retryCount > MAX_RETRIES) {
        onError(new Error('Max retries exceeded. Generation status unknown.'));
        return;
      }

      // Exponential backoff, capped at 30s
      currentDelay = Math.min(intervalMs * Math.pow(2, retryCount - 1), 30000);
      onError(new Error('Connection issue — retrying…'));
      setTimeout(poll, currentDelay);
    }
  }

  // Start polling immediately
  poll();

  return {
    stop() {
      stopped = true;
    },
  };
}
