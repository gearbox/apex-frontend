import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';
import type { components } from '$lib/api/types';

type FrameJobCreatedResponse = components['schemas']['FrameJobCreatedResponse'];
type FrameJobResponse = components['schemas']['FrameJobResponse'];
type FrameJobSource = components['schemas']['FrameJobSource'];
type FramePreviewResult = components['schemas']['FramePreviewResult'];
type FrameExtractResult = components['schemas']['FrameExtractResult'];

type FrameJobKind = 'preview' | 'extract';
type FrameJobStatus = 'queued' | 'running' | 'completed' | 'failed';

interface FrameRequestBody {
  source_output_id?: unknown;
  source_upload_id?: unknown;
  timestamps_ms?: unknown;
}

interface MockFrameJob {
  id: string;
  kind: FrameJobKind;
  source: FrameJobSource;
  timestampsMs: number[];
  fails: boolean;
  pollCount: number;
}

const PREVIEW_FRAME_COUNT = 12;
const PREVIEW_DURATION_MS = 12_345;

/** Use this source ID in tests or stories to exercise the terminal failure UI. */
export const FRAME_FAILURE_SOURCE_ID = 'frame_failure_source';
export const FRAME_FAILED_JOB_ID = 'frame_failed_job';

export const failedFrameJobFixture: FrameJobResponse = {
  job_id: FRAME_FAILED_JOB_ID,
  kind: 'extract',
  status: 'failed',
  created_at: '2026-07-13T10:00:00.000Z',
  started_at: '2026-07-13T10:00:01.000Z',
  finished_at: '2026-07-13T10:00:02.000Z',
  error: 'Frames could not be extracted: source file is corrupt',
  source: { type: 'upload', id: FRAME_FAILURE_SOURCE_ID },
  preview: null,
  extracted: null,
};

const jobs = new Map<string, MockFrameJob>();
let nextJobNumber = 1;

function parseSource(body: FrameRequestBody): FrameJobSource | null {
  const outputId = typeof body.source_output_id === 'string' ? body.source_output_id : null;
  const uploadId = typeof body.source_upload_id === 'string' ? body.source_upload_id : null;

  if (Boolean(outputId) === Boolean(uploadId)) return null;
  return outputId ? { type: 'output', id: outputId } : { type: 'upload', id: uploadId! };
}

function makePreviewResult(jobId: string, urlVersion: number): FramePreviewResult {
  return {
    duration_ms: PREVIEW_DURATION_MS,
    expires_in_seconds: 3600,
    frames: Array.from({ length: PREVIEW_FRAME_COUNT }, (_, index) => ({
      index,
      timestamp_ms: Math.round((index * PREVIEW_DURATION_MS) / PREVIEW_FRAME_COUNT),
      // URLs are deliberately different for every GET, matching the API's
      // presigned-preview URL semantics.
      url: `https://frame-previews.example.test/${jobId}/${index}.webp?version=${urlVersion}`,
    })),
  };
}

function makeExtractedResult(job: MockFrameJob): FrameExtractResult {
  return {
    frames: job.timestampsMs.map((timestampMs, index) => {
      const uploadId = `frame_upload_${job.id}_${index + 1}`;
      return {
        timestamp_ms: timestampMs,
        upload_id: uploadId,
        media: {
          media_type: 'image',
          original: {
            url: `/v1/content/uploads/${uploadId}`,
            width: 1920,
            height: 1080,
            content_type: 'image/png',
            size_bytes: 1_048_576,
          },
          variants: [
            {
              label: 'sm',
              width: 150,
              height: 84,
              url: `/v1/content/uploads/${uploadId}_sm`,
            },
            {
              label: 'md',
              width: 512,
              height: 288,
              url: `/v1/content/uploads/${uploadId}_md`,
            },
          ],
        },
      };
    }),
  };
}

function jobStatus(job: MockFrameJob): FrameJobStatus {
  if (job.pollCount === 0) return 'queued';
  if (job.pollCount === 1) return 'running';
  return job.fails ? 'failed' : 'completed';
}

function makeFrameJobResponse(job: MockFrameJob): FrameJobResponse {
  const status = jobStatus(job);
  const isTerminal = status === 'completed' || status === 'failed';

  return {
    job_id: job.id,
    kind: job.kind,
    status,
    created_at: '2026-07-13T10:00:00.000Z',
    started_at: status === 'queued' ? null : '2026-07-13T10:00:01.000Z',
    finished_at: isTerminal ? '2026-07-13T10:00:02.000Z' : null,
    error: status === 'failed' ? 'Frames could not be extracted: source file is corrupt' : null,
    source: job.source,
    preview:
      status === 'completed' && job.kind === 'preview'
        ? makePreviewResult(job.id, job.pollCount)
        : null,
    extracted: status === 'completed' && job.kind === 'extract' ? makeExtractedResult(job) : null,
  };
}

async function createFrameJob(request: Request, kind: FrameJobKind) {
  const body = (await request.json()) as FrameRequestBody;
  const source = parseSource(body);

  if (!source) {
    return HttpResponse.json(
      {
        error: 'invalid_source',
        message: 'Exactly one source_output_id or source_upload_id is required',
        status_code: 400,
      },
      { status: 400 },
    );
  }

  const id = `frame_${kind}_job_${nextJobNumber++}`;
  const timestampsMs = Array.isArray(body.timestamps_ms)
    ? body.timestamps_ms.filter((timestamp): timestamp is number => typeof timestamp === 'number')
    : [0, 1000];
  jobs.set(id, {
    id,
    kind,
    source,
    timestampsMs,
    fails: source.id === FRAME_FAILURE_SOURCE_ID,
    pollCount: 0,
  });

  const response: FrameJobCreatedResponse = { job_id: id, status: 'queued' };
  return HttpResponse.json(response, { status: 202 });
}

export const frameHandlers = [
  http.post(`${BASE}/v1/frames/preview`, ({ request }) => createFrameJob(request, 'preview')),

  http.post(`${BASE}/v1/frames/extract`, ({ request }) => createFrameJob(request, 'extract')),

  http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) => {
    const jobId = params.job_id as string;
    if (jobId === FRAME_FAILED_JOB_ID) return HttpResponse.json(failedFrameJobFixture);

    const job = jobs.get(jobId);
    if (!job) {
      return HttpResponse.json(
        { error: 'not_found', message: 'Frame job not found', status_code: 404 },
        { status: 404 },
      );
    }

    const response = makeFrameJobResponse(job);
    job.pollCount++;
    return HttpResponse.json(response);
  }),
];
