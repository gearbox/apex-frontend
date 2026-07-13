// Pure service — no Svelte dependency. Testable in isolation.
import { frameJobQueryFn, type FrameJobResponse } from '$lib/queries/frames';
import { FRAME_POLL_BUDGET_MS, FRAME_POLL_INTERVAL_MS } from '$lib/utils/constants';

const MAX_RETRIES = 5;
const MAX_RETRY_DELAY_MS = 30_000;

export interface FrameJobPollOptions {
  jobId: string;
  intervalMs?: number;
  budgetMs?: number;
  onUpdate: (job: FrameJobResponse) => void;
  onComplete: (job: FrameJobResponse) => void;
  onError: (error: Error) => void;
  onRetry?: (error: Error) => void;
}

export function createFrameJobPoller(options: FrameJobPollOptions): { stop: () => void } {
  const {
    jobId,
    intervalMs = FRAME_POLL_INTERVAL_MS,
    budgetMs = FRAME_POLL_BUDGET_MS,
    onUpdate,
    onComplete,
    onError,
    onRetry,
  } = options;

  const deadline = Date.now() + budgetMs;
  let stopped = false;
  let retryCount = 0;
  let currentDelay = intervalMs;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  function clearTimers() {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    clearTimeout(deadlineTimeoutId);
  }

  function complete(job: FrameJobResponse) {
    if (stopped) return;
    stopped = true;
    clearTimers();
    onComplete(job);
  }

  function fail(error: Error) {
    if (stopped) return;
    stopped = true;
    clearTimers();
    onError(error);
  }

  // The job-status request itself can hang (for example, on a stalled network
  // connection). Keep an independent deadline so the advertised budget covers
  // that await as well as the intervals between successful requests.
  const deadlineTimeoutId = setTimeout(() => {
    fail(new Error('frame job polling timed out'));
  }, budgetMs);

  function scheduleNext(delay: number) {
    if (!stopped) timeoutId = setTimeout(poll, delay);
  }

  async function poll() {
    if (stopped) return;

    if (Date.now() >= deadline) {
      fail(new Error('frame job polling timed out'));
      return;
    }

    try {
      const job = await frameJobQueryFn(jobId);

      if (stopped) return;

      retryCount = 0;
      currentDelay = intervalMs;

      if (job.status === 'completed') {
        complete(job);
        return;
      }

      if (job.status === 'failed') {
        fail(new Error(job.error || 'Frame job failed'));
        return;
      }

      onUpdate(job);

      if (Date.now() >= deadline) {
        fail(new Error('frame job polling timed out'));
        return;
      }

      scheduleNext(currentDelay);
    } catch {
      if (stopped) return;

      retryCount++;
      if (retryCount > MAX_RETRIES) {
        fail(new Error('Max retries exceeded. Frame job status unknown.'));
        return;
      }

      // Exponential backoff, capped at 30 seconds, mirroring the generation job poller.
      currentDelay = Math.min(intervalMs * Math.pow(2, retryCount - 1), MAX_RETRY_DELAY_MS);
      onRetry?.(new Error('Connection issue — retrying…'));
      scheduleNext(currentDelay);
    }
  }

  // Start polling immediately.
  void poll();

  return {
    stop() {
      stopped = true;
      clearTimers();
    },
  };
}
