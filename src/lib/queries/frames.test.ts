import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  extractFramesMutationOptions,
  frameJobQueryFn,
  framesKeys,
  previewFramesMutationOptions,
} from './frames';

const BASE = 'http://localhost:8000';

describe('framesKeys', () => {
  it('uses a stable frames prefix for job keys', () => {
    expect(framesKeys.all).toEqual(['frames']);
    expect(framesKeys.job('frame_job_001')).toEqual(['frames', 'job', 'frame_job_001']);
  });
});

describe('previewFramesMutationOptions()', () => {
  it('posts an output XOR body without an idempotency key', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let idempotencyKey: string | null = null;

    server.use(
      http.post(`${BASE}/v1/frames/preview`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        idempotencyKey = request.headers.get('Idempotency-Key');
        return HttpResponse.json({ job_id: 'preview_job_001', status: 'queued' }, { status: 202 });
      }),
    );

    const result = await previewFramesMutationOptions().mutationFn({
      source: { type: 'output', id: 'output_001' },
      frameCount: 6,
    });

    expect(result).toEqual({ job_id: 'preview_job_001', status: 'queued' });
    expect(capturedBody).toEqual({ source_output_id: 'output_001', frame_count: 6 });
    expect(capturedBody).not.toHaveProperty('source_upload_id');
    expect(idempotencyKey).toBeNull();
  });

  it('defaults frame_count to 6', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.post(`${BASE}/v1/frames/preview`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { job_id: 'preview_job_default', status: 'queued' },
          { status: 202 },
        );
      }),
    );

    await previewFramesMutationOptions().mutationFn({
      source: { type: 'upload', id: 'upload_001' },
    });

    expect(capturedBody).toEqual({ source_upload_id: 'upload_001', frame_count: 6 });
    expect(capturedBody).not.toHaveProperty('source_output_id');
  });
});

describe('extractFramesMutationOptions()', () => {
  it('posts an upload XOR body with timestamps in API casing', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.post(`${BASE}/v1/frames/extract`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ job_id: 'extract_job_001', status: 'queued' }, { status: 202 });
      }),
    );

    const result = await extractFramesMutationOptions().mutationFn({
      source: { type: 'upload', id: 'upload_001' },
      timestampsMs: [0, 1024, 4096],
    });

    expect(result).toEqual({ job_id: 'extract_job_001', status: 'queued' });
    expect(capturedBody).toEqual({
      source_upload_id: 'upload_001',
      timestamps_ms: [0, 1024, 4096],
    });
    expect(capturedBody).not.toHaveProperty('source_output_id');
  });
});

describe('frameJobQueryFn()', () => {
  it('fetches the requested job by ID', async () => {
    let requestedJobId: string | null = null;
    const response = {
      job_id: 'frame_job_001',
      kind: 'preview',
      status: 'completed',
      created_at: '2026-07-13T10:00:00.000Z',
      started_at: '2026-07-13T10:00:01.000Z',
      finished_at: '2026-07-13T10:00:02.000Z',
      error: null,
      source: { type: 'output', id: 'output_001' },
      preview: { frames: [], duration_ms: 12345, expires_in_seconds: 3600 },
      extracted: null,
    };

    server.use(
      http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) => {
        requestedJobId = params.job_id as string;
        return HttpResponse.json(response);
      }),
    );

    await expect(frameJobQueryFn('frame_job_001')).resolves.toEqual(response);
    expect(requestedJobId).toBe('frame_job_001');
  });
});
