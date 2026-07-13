import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import type { components } from '$lib/api/types';

const { gotoMock, invalidateQueriesMock, setModeMock, setUploadedImageIdMock } = vi.hoisted(() => ({
  gotoMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  setModeMock: vi.fn(),
  setUploadedImageIdMock: vi.fn(),
}));

vi.mock('$app/navigation', () => ({ goto: gotoMock }));

vi.mock('$lib/stores/generation', () => ({
  generationStore: {
    setMode: setModeMock,
    setUploadedImageId: setUploadedImageIdMock,
  },
}));

// The query layer itself remains real and is backed by MSW below. This small
// adapter avoids requiring an application-level QueryClientProvider in a
// component-focused test while retaining the mutation request behavior.
vi.mock('@tanstack/svelte-query', () => ({
  createMutation: vi.fn(
    (optionsFactory: () => { mutationFn: (variables: unknown) => Promise<unknown> }) => ({
      mutateAsync: (variables: unknown) => optionsFactory().mutationFn(variables),
    }),
  ),
  useQueryClient: vi.fn(() => ({ invalidateQueries: invalidateQueriesMock })),
}));

vi.mock('$paraglide/messages', () => ({
  frames_title: () => 'Extract frames',
  frames_close: () => 'Close',
  frames_preview_loading: () => 'Preparing frame preview…',
  frames_preview_error: () => "Couldn't load the frame preview.",
  frames_preview_ready: () => 'Select frames to extract',
  frames_add_frame: () => 'Add frame',
  frames_selected_count: ({ count }: { count: number }) => `${count} selected`,
  frames_selected_limit: () => 'You can select up to 50 frames.',
  frames_scrubber_label: () => 'Frame timestamp',
  frames_no_selection: () => 'Select at least one frame to extract.',
  frames_extract_loading: () => 'Extracting frames…',
  frames_use_as_input: () => 'Use as input',
  frames_job_failed_retry: () => 'Retry',
  frames_extract_action: () => 'Extract frames',
}));

import FrameExtractModal from './FrameExtractModal.svelte';

type MediaObject = components['schemas']['MediaObject'];
type FrameJobResponse = components['schemas']['FrameJobResponse'];

const SOURCE_ID = 'video-upload-001';
const DURATION_MS = 12_345;
const MAX_TIMESTAMP = DURATION_MS - 1;

const videoMedia: MediaObject = {
  media_type: 'video',
  original: {
    url: '/v1/content/uploads/video-upload-001',
    width: 1920,
    height: 1080,
    content_type: 'video/mp4',
    size_bytes: 5_000_000,
  },
  variants: [],
};

function previewJob(jobId = 'preview-job'): FrameJobResponse {
  return {
    job_id: jobId,
    kind: 'preview',
    status: 'completed',
    created_at: '2026-07-13T10:00:00.000Z',
    started_at: '2026-07-13T10:00:01.000Z',
    finished_at: '2026-07-13T10:00:02.000Z',
    error: null,
    source: { type: 'upload', id: SOURCE_ID },
    preview: {
      duration_ms: DURATION_MS,
      expires_in_seconds: 3600,
      frames: Array.from({ length: 12 }, (_, index) => ({
        index,
        timestamp_ms: Math.round((index * DURATION_MS) / 12),
        url: `https://frame-previews.example.test/${jobId}/${index}.webp`,
      })),
    },
    extracted: null,
  };
}

function extractedJob(jobId: string, timestamps: number[]): FrameJobResponse {
  return {
    job_id: jobId,
    kind: 'extract',
    status: 'completed',
    created_at: '2026-07-13T10:00:00.000Z',
    started_at: '2026-07-13T10:00:01.000Z',
    finished_at: '2026-07-13T10:00:02.000Z',
    error: null,
    source: { type: 'upload', id: SOURCE_ID },
    preview: null,
    extracted: {
      frames: timestamps.map((timestampMs, index) => {
        const uploadId = `extracted-upload-${index + 1}`;
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
              size_bytes: 1_000_000,
            },
            variants: [],
          },
        };
      }),
    },
  };
}

function failedPreviewJob(jobId: string, error: string): FrameJobResponse {
  return {
    job_id: jobId,
    kind: 'preview',
    status: 'failed',
    created_at: '2026-07-13T10:00:00.000Z',
    started_at: '2026-07-13T10:00:01.000Z',
    finished_at: '2026-07-13T10:00:02.000Z',
    error,
    source: { type: 'upload', id: SOURCE_ID },
    preview: null,
    extracted: null,
  };
}

function renderModal(onclose = vi.fn()) {
  render(FrameExtractModal, {
    props: {
      source: { type: 'upload', id: SOURCE_ID },
      media: videoMedia,
      onclose,
    },
  });
  return onclose;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FrameExtractModal', () => {
  it('starts a 12-frame preview and renders the initial strip', async () => {
    let previewBody: Record<string, unknown> | null = null;

    server.use(
      http.post(`${BASE}/v1/frames/preview`, async ({ request }) => {
        previewBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ job_id: 'preview-job', status: 'queued' }, { status: 202 });
      }),
      http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) => {
        return HttpResponse.json(previewJob(params.job_id as string));
      }),
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(12);
    });

    expect(previewBody).toEqual({ source_upload_id: SOURCE_ID, frame_count: 12 });
    expect(screen.getByRole('slider', { name: 'Frame timestamp' }).getAttribute('max')).toBe(
      String(MAX_TIMESTAMP),
    );
  });

  it('clamps a scrub selection before extracting, then exposes extracted frames for use', async () => {
    let extractBody: Record<string, unknown> | null = null;

    server.use(
      http.post(`${BASE}/v1/frames/preview`, () =>
        HttpResponse.json({ job_id: 'preview-job', status: 'queued' }, { status: 202 }),
      ),
      http.post(`${BASE}/v1/frames/extract`, async ({ request }) => {
        extractBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ job_id: 'extract-job', status: 'queued' }, { status: 202 });
      }),
      http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) => {
        const jobId = params.job_id as string;
        if (jobId === 'extract-job') {
          const timestamps = (extractBody?.timestamps_ms as number[] | undefined) ?? [];
          return HttpResponse.json(extractedJob(jobId, timestamps));
        }
        return HttpResponse.json(previewJob(jobId));
      }),
    );

    const onclose = renderModal();

    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(12);
    });

    await fireEvent.click(screen.getByRole('button', { name: '00:00.000' }));

    const scrubber = screen.getByRole('slider', { name: 'Frame timestamp' });
    // A real range element enforces max itself. Shadow it for this focused
    // boundary test so the event handler receives a truly out-of-range value.
    Object.defineProperty(scrubber, 'value', {
      configurable: true,
      value: '999999',
      writable: true,
    });
    await fireEvent.input(scrubber);
    await fireEvent.click(screen.getByRole('button', { name: 'Add frame' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));

    await waitFor(() => {
      expect(extractBody).toEqual({
        source_upload_id: SOURCE_ID,
        timestamps_ms: [0, MAX_TIMESTAMP],
      });
    });

    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(2);
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['storage'] });

    await fireEvent.click(screen.getAllByRole('button', { name: 'Use as input' })[0]);
    expect(setModeMock).toHaveBeenCalledWith('i2i');
    expect(setUploadedImageIdMock).toHaveBeenCalledWith(
      'extracted-upload-1',
      'http://localhost:8000/v1/content/uploads/extracted-upload-1',
    );
    expect(gotoMock).toHaveBeenCalledWith('/app/create');
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('shows a failed job error verbatim and retries by posting another preview job', async () => {
    const error = 'Frames could not be extracted: source file is corrupt';
    const previewBodies: Record<string, unknown>[] = [];

    server.use(
      http.post(`${BASE}/v1/frames/preview`, async ({ request }) => {
        previewBodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(
          { job_id: `failed-preview-${previewBodies.length}`, status: 'queued' },
          { status: 202 },
        );
      }),
      http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) => {
        return HttpResponse.json(failedPreviewJob(params.job_id as string, error));
      }),
    );

    renderModal();

    expect(await screen.findByText(error)).toBeTruthy();
    expect(previewBodies).toEqual([{ source_upload_id: SOURCE_ID, frame_count: 12 }]);

    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(previewBodies).toEqual([
        { source_upload_id: SOURCE_ID, frame_count: 12 },
        { source_upload_id: SOURCE_ID, frame_count: 12 },
      ]);
    });
    expect(await screen.findByText(error)).toBeTruthy();
  });
});
