import apiClient from '$lib/api/client';
import { isApiError, throwApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';

export type FrameJobCreatedResponse = components['schemas']['FrameJobCreatedResponse'];
export type FrameJobResponse = components['schemas']['FrameJobResponse'];
export type FramePreviewRequest = components['schemas']['FramePreviewRequest'];
export type FrameExtractRequest = components['schemas']['FrameExtractRequest'];

export type FrameSource = { type: 'output' | 'upload'; id: string };

export interface PreviewFramesVariables {
  source: FrameSource;
  frameCount?: number;
}

export interface ExtractFramesVariables {
  source: FrameSource;
  timestampsMs: number[];
}

const DEFAULT_FRAME_COUNT = 12;

/* ─── Query Key Factory ─── */

export const framesKeys = {
  all: ['frames'] as const,
  job: (jobId: string) => [...framesKeys.all, 'job', jobId] as const,
};

function sourceBody(
  source: FrameSource,
): Pick<FramePreviewRequest, 'source_output_id' | 'source_upload_id'> {
  // The frame endpoints require an XOR source body. Keep the inactive field
  // absent rather than serialising it as null.
  return source.type === 'output'
    ? { source_output_id: source.id }
    : { source_upload_id: source.id };
}

function throwIfFrameApiError(data: unknown, error: unknown, fallbackMessage: string): void {
  if (error || !data) throwApiError(error, fallbackMessage);
  if (isApiError(data)) {
    throwApiError(data, fallbackMessage);
  }
}

export function previewFramesMutationOptions() {
  return {
    mutationFn: async ({ source, frameCount = DEFAULT_FRAME_COUNT }: PreviewFramesVariables) => {
      const body: FramePreviewRequest = {
        ...sourceBody(source),
        frame_count: frameCount,
      };
      const { data, error } = await apiClient.POST('/v1/frames/preview', { body });
      throwIfFrameApiError(data, error, 'Failed to create frame preview job');
      return data as FrameJobCreatedResponse;
    },
  };
}

export function extractFramesMutationOptions() {
  return {
    mutationFn: async ({ source, timestampsMs }: ExtractFramesVariables) => {
      const body: FrameExtractRequest = {
        ...sourceBody(source),
        timestamps_ms: timestampsMs,
      };
      const { data, error } = await apiClient.POST('/v1/frames/extract', { body });
      throwIfFrameApiError(data, error, 'Failed to create frame extraction job');
      return data as FrameJobCreatedResponse;
    },
  };
}

/** Fetches a frame job directly; preview URLs intentionally never enter query cache. */
export async function frameJobQueryFn(jobId: string): Promise<FrameJobResponse> {
  const { data, error } = await apiClient.GET('/v1/frames/jobs/{job_id}', {
    params: { path: { job_id: jobId } },
  });
  throwIfFrameApiError(data, error, 'Failed to fetch frame job status');
  return data as FrameJobResponse;
}
