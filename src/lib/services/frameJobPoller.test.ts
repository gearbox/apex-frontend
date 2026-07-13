import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameJobResponse } from '$lib/queries/frames';

const { frameJobQueryFnMock } = vi.hoisted(() => ({
  frameJobQueryFnMock: vi.fn(),
}));

vi.mock('$lib/queries/frames', () => ({
  frameJobQueryFn: frameJobQueryFnMock,
}));

import { createFrameJobPoller } from './frameJobPoller';

function makeJob(status: string, error: string | null = null): FrameJobResponse {
  return {
    job_id: 'frame_job_001',
    kind: 'preview',
    status,
    created_at: '2026-07-13T10:00:00.000Z',
    started_at: null,
    finished_at: null,
    error,
    source: { type: 'output', id: 'output_001' },
    preview: null,
    extracted: null,
  };
}

async function flushInitialPoll() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('createFrameJobPoller()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T10:00:00.000Z'));
    frameJobQueryFnMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('polls queued and running jobs until completed', async () => {
    const queued = makeJob('queued');
    const running = makeJob('running');
    const completed = makeJob('completed');
    frameJobQueryFnMock
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(completed);

    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    createFrameJobPoller({
      jobId: 'frame_job_001',
      intervalMs: 1000,
      onUpdate,
      onComplete,
      onError,
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(frameJobQueryFnMock).toHaveBeenCalledTimes(3);
    expect(onUpdate).toHaveBeenNthCalledWith(1, queued);
    expect(onUpdate).toHaveBeenNthCalledWith(2, running);
    expect(onComplete).toHaveBeenCalledWith(completed);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports the server error verbatim when a job fails', async () => {
    frameJobQueryFnMock.mockResolvedValueOnce(makeJob('failed', 'Video timestamp is out of range'));
    const onError = vi.fn();

    createFrameJobPoller({
      jobId: 'frame_job_001',
      onUpdate: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    await flushInitialPoll();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Video timestamp is out of range' }),
    );
  });

  it('reports a timeout after the polling budget is exhausted', async () => {
    frameJobQueryFnMock.mockResolvedValue(makeJob('running'));
    const onError = vi.fn();

    createFrameJobPoller({
      jobId: 'frame_job_001',
      intervalMs: 1000,
      budgetMs: 2000,
      onUpdate: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(frameJobQueryFnMock).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'frame job polling timed out' }),
    );
  });

  it('enforces the budget while a status request is still hanging', async () => {
    let resolveRequest: (job: FrameJobResponse) => void;
    frameJobQueryFnMock.mockImplementation(
      () =>
        new Promise<FrameJobResponse>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const onError = vi.fn();

    createFrameJobPoller({
      jobId: 'frame_job_001',
      budgetMs: 2000,
      onUpdate: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'frame job polling timed out' }),
    );

    // Let the held request settle so the test does not leave a pending async
    // operation behind after the poller has already stopped.
    resolveRequest!(makeJob('running'));
    await flushInitialPoll();
  });

  it('retries transient failures with backoff and stops after five retries', async () => {
    frameJobQueryFnMock.mockRejectedValue(new Error('Network unavailable'));
    const onRetry = vi.fn();
    const onError = vi.fn();

    createFrameJobPoller({
      jobId: 'frame_job_001',
      intervalMs: 100,
      budgetMs: 10_000,
      onUpdate: vi.fn(),
      onComplete: vi.fn(),
      onError,
      onRetry,
    });

    // 100 + 200 + 400 + 800 + 1600 ms reaches the sixth failed request.
    await vi.advanceTimersByTimeAsync(3100);

    expect(frameJobQueryFnMock).toHaveBeenCalledTimes(6);
    expect(onRetry).toHaveBeenCalledTimes(5);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Connection issue — retrying…' }),
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Max retries exceeded. Frame job status unknown.' }),
    );
  });

  it('halts scheduled polls after stop()', async () => {
    frameJobQueryFnMock.mockResolvedValue(makeJob('running'));
    const onUpdate = vi.fn();
    const poller = createFrameJobPoller({
      jobId: 'frame_job_001',
      intervalMs: 1000,
      onUpdate,
      onComplete: vi.fn(),
      onError: vi.fn(),
    });

    await flushInitialPoll();
    poller.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(frameJobQueryFnMock).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
