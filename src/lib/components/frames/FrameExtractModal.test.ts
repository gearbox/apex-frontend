import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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

const { desktopBreakpoint } = vi.hoisted(() => {
  let current = false;
  const subscribers = new Set<(value: boolean) => void>();
  return {
    desktopBreakpoint: {
      subscribe(subscriber: (value: boolean) => void) {
        subscribers.add(subscriber);
        subscriber(current);
        return () => subscribers.delete(subscriber);
      },
      set(value: boolean) {
        current = value;
        subscribers.forEach((subscriber) => subscriber(value));
      },
    },
  };
});

vi.mock('$app/navigation', () => ({ goto: gotoMock }));

vi.mock('$lib/stores/generation', () => ({
  generationStore: {
    setMode: setModeMock,
    setUploadedImageId: setUploadedImageIdMock,
  },
}));

vi.mock('$lib/utils/breakpoints', () => ({ isDesktop: desktopBreakpoint }));

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
  frames_automatic: () => 'Automatic',
  frames_manually_chosen: () => 'Manually chosen frames',
  frames_no_manual_frames: () => 'Frames added from the scrubber will appear here.',
  frames_add_frame: () => 'Add frame',
  frames_adding_frame: () => 'Adding frame…',
  frames_frame_added: () => 'Frame added',
  frames_frame_already_added: () => 'Frame already added',
  frames_already_available_automatic: () => 'Already available under Automatic',
  frames_remove_manual_frame: ({ timestamp }: { timestamp: string }) =>
    `Remove manually chosen frame at ${timestamp}`,
  frames_frame_display_error: () => 'Could not display this video frame',
  frames_live_preview_too_large: () =>
    'Live manual preview is unavailable for this video because it is too large. Automatic frames are still available.',
  frames_frame_capture_cors_error: () => 'Video access is blocked',
  frames_frame_loading: () => 'Loading frame preview…',
  error_unauthorized: () => 'Your session has expired. Please sign in again.',
  frames_retry_frame_preview: () => 'Retry frame preview',
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

function installDecodedVideoMocks(): () => void {
  const restores: Array<() => void> = [];
  const replace = (target: object, key: PropertyKey, descriptor: PropertyDescriptor) => {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, ...descriptor });
    restores.push(() => {
      if (previous) Object.defineProperty(target, key, previous);
      else Reflect.deleteProperty(target, key);
    });
  };

  let currentTime = 0;
  replace(HTMLMediaElement.prototype, 'readyState', {
    get: () => HTMLMediaElement.HAVE_CURRENT_DATA,
  });
  replace(HTMLVideoElement.prototype, 'videoWidth', { get: () => 1920 });
  replace(HTMLVideoElement.prototype, 'videoHeight', { get: () => 1080 });
  replace(HTMLMediaElement.prototype, 'currentTime', {
    get: () => currentTime,
    set(this: HTMLMediaElement, value: number) {
      const changed = Math.abs(currentTime - value) > 0.0001;
      currentTime = value;
      if (changed) queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
    },
  });
  replace(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ({ drawImage: vi.fn() }),
  });
  replace(HTMLCanvasElement.prototype, 'toBlob', {
    value: (callback: BlobCallback) => callback(new Blob(['frame'], { type: 'image/webp' })),
  });

  let previewNumber = 0;
  replace(URL, 'createObjectURL', { value: () => `blob:frame-${++previewNumber}` });
  replace(URL, 'revokeObjectURL', { value: vi.fn() });

  return () => restores.reverse().forEach((restore) => restore());
}

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
      frames: Array.from({ length: 6 }, (_, index) => ({
        index,
        timestamp_ms: Math.round((index * DURATION_MS) / 6),
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

function dispatchBackdropPointer(
  target: HTMLElement,
  type: string,
  {
    pointerType = 'mouse',
    pointerId = 1,
    clientX = 0,
    clientY = 0,
    isPrimary = true,
  }: {
    pointerType?: string;
    pointerId?: number;
    clientX?: number;
    clientY?: number;
    isPrimary?: boolean;
  } = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    isPrimary: { value: isPrimary },
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  target.dispatchEvent(event);
}

beforeEach(() => {
  vi.clearAllMocks();
  desktopBreakpoint.set(false);
});

afterEach(() => cleanup());

describe('FrameExtractModal', () => {
  it('uses a full-height mobile panel with a dedicated contained scroll viewport', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Extract frames' });
    const panel = dialog.firstElementChild as HTMLElement;
    const scrollViewport = dialog.querySelector<HTMLElement>('[data-frame-modal-scroll]');
    const closeButton = screen.getByRole('button', { name: 'Close' });

    expect(panel.className).toContain('h-[100dvh]');
    expect(panel.className).toContain('overflow-hidden');
    expect(scrollViewport).not.toBeNull();
    expect(scrollViewport?.style.overscrollBehaviorY).toBe('contain');
    expect(scrollViewport?.contains(closeButton)).toBe(false);
    expect(panel.querySelector('header')?.nextElementSibling).toBe(scrollViewport);
  });

  it('never dismisses on a mobile touch drag or pointer movement, while explicit Close still works', () => {
    const onclose = renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Extract frames' });

    dispatchBackdropPointer(dialog, 'pointerdown', { pointerType: 'touch', clientY: 120 });
    dispatchBackdropPointer(dialog, 'pointermove', { pointerType: 'touch', clientY: 20 });
    dispatchBackdropPointer(dialog, 'pointerup', { pointerType: 'touch', clientY: 20 });
    expect(onclose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('dismisses only a stationary primary mouse backdrop tap on desktop', () => {
    desktopBreakpoint.set(true);
    const onclose = renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Extract frames' });

    dispatchBackdropPointer(dialog, 'pointerdown', { clientX: 12, clientY: 12 });
    dispatchBackdropPointer(dialog, 'pointermove', { clientX: 40, clientY: 12 });
    dispatchBackdropPointer(dialog, 'pointerup', { clientX: 40, clientY: 12 });
    expect(onclose).not.toHaveBeenCalled();

    dispatchBackdropPointer(dialog, 'pointerdown', { pointerId: 2, clientX: 12, clientY: 12 });
    dispatchBackdropPointer(dialog, 'pointerup', { pointerId: 2, clientX: 12, clientY: 12 });
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('keeps a selected automatic frame through a synthetic mobile scroll sequence', async () => {
    server.use(
      http.post(`${BASE}/v1/frames/preview`, () =>
        HttpResponse.json({ job_id: 'preview-job', status: 'queued' }, { status: 202 }),
      ),
      http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) =>
        HttpResponse.json(previewJob(params.job_id as string)),
      ),
    );
    const onclose = renderModal();
    await screen.findByRole('button', { name: 'Automatic: 00:00.000' });
    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.000' }));

    const dialog = screen.getByRole('dialog', { name: 'Extract frames' });
    dispatchBackdropPointer(dialog, 'pointerdown', { pointerType: 'touch', clientY: 200 });
    dispatchBackdropPointer(dialog, 'pointermove', { pointerType: 'touch', clientY: 40 });
    dispatchBackdropPointer(dialog, 'pointerup', { pointerType: 'touch', clientY: 40 });

    expect(onclose).not.toHaveBeenCalled();
    expect(screen.getAllByText('1 selected')).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Automatic: 00:00.000' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('focuses the close control and restores focus to the supplied extraction trigger on teardown', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Extract frames';
    document.body.appendChild(trigger);
    trigger.focus();
    const onclose = vi.fn();
    const view = render(FrameExtractModal, {
      props: {
        source: { type: 'upload', id: SOURCE_ID },
        media: videoMedia,
        onclose,
        trigger,
      },
    });

    try {
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' })),
      );
      await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onclose).toHaveBeenCalledOnce();
      view.unmount();
      expect(document.activeElement).toBe(trigger);
    } finally {
      view.unmount();
      trigger.remove();
    }
  });

  it('starts a 6-frame preview and renders the Automatic and empty manual sections', async () => {
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
      expect(screen.getAllByRole('button', { name: /^Automatic:/ })).toHaveLength(6);
    });

    expect(previewBody).toEqual({ source_upload_id: SOURCE_ID, frame_count: 6 });
    expect(screen.getByRole('heading', { name: 'Automatic' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Manually chosen frames' })).toBeTruthy();
    expect(screen.getByText('Frames added from the scrubber will appear here.')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Frame timestamp' }).getAttribute('max')).toBe(
      String(MAX_TIMESTAMP),
    );
  });

  it('keeps Automatic selection available when the live manual preview is too large', async () => {
    server.use(
      http.get(
        `${BASE}/v1/content/uploads/:upload_id`,
        () =>
          new HttpResponse(new Uint8Array([1]), {
            headers: { 'content-type': 'video/mp4', 'content-length': String(26 * 1024 * 1024) },
          }),
      ),
      http.post(`${BASE}/v1/frames/preview`, () =>
        HttpResponse.json({ job_id: 'preview-job', status: 'queued' }, { status: 202 }),
      ),
      http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) =>
        HttpResponse.json(previewJob(params.job_id as string)),
      ),
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Automatic:/ })).toHaveLength(6);
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Live manual preview is unavailable for this video because it is too large. Automatic frames are still available.',
    );
    expect(screen.getByRole('button', { name: 'Add frame' }).hasAttribute('disabled')).toBe(true);

    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.000' }));
    expect(screen.getByRole('button', { name: 'Extract frames' }).hasAttribute('disabled')).toBe(false);
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
      expect(screen.getAllByRole('button', { name: /^Automatic:/ })).toHaveLength(6);
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.000' }));

    const scrubber = screen.getByRole('slider', { name: 'Frame timestamp' });
    // A real range element enforces max itself. Shadow it for this focused
    // boundary test so the event handler receives a truly out-of-range value.
    Object.defineProperty(scrubber, 'value', {
      configurable: true,
      value: '999999',
      writable: true,
    });
    await fireEvent.input(scrubber);
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));

    await waitFor(() => {
      expect(extractBody).toEqual({
        source_upload_id: SOURCE_ID,
        timestamps_ms: [0],
      });
    });

    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(1);
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

  it('adds, selects, deselects, and submits a manual frame with the automatic union', async () => {
    const restoreMedia = installDecodedVideoMocks();
    let extractBody: Record<string, unknown> | null = null;

    try {
      server.use(
        http.get(
          `${BASE}/v1/content/uploads/:upload_id`,
          () =>
            new HttpResponse(new Blob(['video'], { type: 'video/mp4' }), {
              headers: { 'content-type': 'video/mp4' },
            }),
        ),
        http.post(`${BASE}/v1/frames/preview`, () =>
          HttpResponse.json({ job_id: 'preview-job', status: 'queued' }, { status: 202 }),
        ),
        http.post(`${BASE}/v1/frames/extract`, async ({ request }) => {
          extractBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ job_id: 'extract-job', status: 'queued' }, { status: 202 });
        }),
        http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) => {
          const jobId = params.job_id as string;
          return HttpResponse.json(
            jobId === 'extract-job'
              ? extractedJob(jobId, (extractBody?.timestamps_ms as number[] | undefined) ?? [])
              : previewJob(jobId),
          );
        }),
      );

      renderModal();
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /^Automatic:/ })).toHaveLength(6);
      });

      await fireEvent.input(screen.getByRole('slider', { name: 'Frame timestamp' }), {
        target: { value: '1000' },
      });
      const addButton = screen.getByRole('button', { name: 'Add frame' });
      await waitFor(() => expect(addButton.hasAttribute('disabled')).toBe(false));
      await fireEvent.click(addButton);

      const manualCard = await screen.findByRole('button', {
        name: 'Manually chosen frames: 00:01.000',
      });
      expect(manualCard.getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByText('Frame added')).toBeTruthy();

      await fireEvent.click(addButton);
      await waitFor(() => expect(screen.getByText('Frame already added')).toBeTruthy());
      expect(
        screen.getAllByRole('button', { name: 'Manually chosen frames: 00:01.000' }),
      ).toHaveLength(1);

      await fireEvent.click(manualCard);
      expect(manualCard.getAttribute('aria-pressed')).toBe('false');
      await fireEvent.click(manualCard);
      await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.000' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));

      await waitFor(() => {
        expect(extractBody).toEqual({ source_upload_id: SOURCE_ID, timestamps_ms: [0, 1000] });
      });
    } finally {
      restoreMedia();
    }
  });

  it('removing a manual card also removes it from the shared selection', async () => {
    const restoreMedia = installDecodedVideoMocks();

    try {
      server.use(
        http.get(
          `${BASE}/v1/content/uploads/:upload_id`,
          () =>
            new HttpResponse(new Blob(['video'], { type: 'video/mp4' }), {
              headers: { 'content-type': 'video/mp4' },
            }),
        ),
        http.post(`${BASE}/v1/frames/preview`, () =>
          HttpResponse.json({ job_id: 'preview-job', status: 'queued' }, { status: 202 }),
        ),
        http.get(`${BASE}/v1/frames/jobs/:job_id`, ({ params }) =>
          HttpResponse.json(previewJob(params.job_id as string)),
        ),
      );
      renderModal();
      await screen.findByRole('button', { name: 'Automatic: 00:00.000' });

      await fireEvent.input(screen.getByRole('slider', { name: 'Frame timestamp' }), {
        target: { value: '1000' },
      });
      const addButton = screen.getByRole('button', { name: 'Add frame' });
      await waitFor(() => expect(addButton.hasAttribute('disabled')).toBe(false));
      await fireEvent.click(addButton);

      await screen.findByRole('button', { name: 'Manually chosen frames: 00:01.000' });
      await fireEvent.click(
        screen.getByRole('button', { name: 'Remove manually chosen frame at 00:01.000' }),
      );
      expect(
        screen.queryByRole('button', { name: 'Manually chosen frames: 00:01.000' }),
      ).toBeNull();
      expect(screen.getAllByText('0 selected')).not.toHaveLength(0);
    } finally {
      restoreMedia();
    }
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
    expect(previewBodies).toEqual([{ source_upload_id: SOURCE_ID, frame_count: 6 }]);

    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(previewBodies).toEqual([
        { source_upload_id: SOURCE_ID, frame_count: 6 },
        { source_upload_id: SOURCE_ID, frame_count: 6 },
      ]);
    });
    expect(await screen.findByText(error)).toBeTruthy();
  });
});
