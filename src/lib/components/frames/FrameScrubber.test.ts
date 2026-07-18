import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { components } from '$lib/api/types';

const { loadMediaMock, captures, disposeMock, AuthenticatedMediaLoadErrorMock } = vi.hoisted(() => {
  class AuthenticatedMediaLoadErrorMock extends Error {
    constructor(
      readonly category: string,
      readonly status: number | null = null,
      readonly retryAttempted = false,
    ) {
      super(category);
    }
  }

  return {
    loadMediaMock: vi.fn(),
    captures: [] as Array<{
      seek: (timestampMs: number) => void;
      dispose: () => void;
    }>,
    disposeMock: vi.fn(),
    AuthenticatedMediaLoadErrorMock,
  };
});

vi.mock('$lib/media/loadAuthenticatedMediaBlob', () => ({
  AuthenticatedMediaLoadError: AuthenticatedMediaLoadErrorMock,
  loadAuthenticatedMediaBlob: loadMediaMock,
}));

vi.mock('./videoFrameCapture', () => ({
  VideoFrameCaptureError: class VideoFrameCaptureError extends Error {},
  VideoFrameCapture: class VideoFrameCapture {
    private readonly onFrame: (frame: {
      timestampMs: number;
      width: number;
      height: number;
    }) => void;
    private readonly onSeekingChange: (seeking: boolean) => void;
    private readonly instance: { seek: (timestampMs: number) => void; dispose: () => void };

    constructor({
      onFrame,
      onSeekingChange,
    }: {
      onFrame: (frame: { timestampMs: number; width: number; height: number }) => void;
      onSeekingChange: (seeking: boolean) => void;
    }) {
      this.onFrame = onFrame;
      this.onSeekingChange = onSeekingChange;
      this.instance = { seek: vi.fn(), dispose: disposeMock };
      captures.push(this.instance);
    }

    supersede() {}

    async seek(timestampMs: number) {
      this.instance.seek(timestampMs);
      this.onSeekingChange(true);
      this.onFrame({ timestampMs, width: 640, height: 360 });
      this.onSeekingChange(false);
      return { timestampMs, width: 640, height: 360 };
    }

    async captureManualFrame(timestampMs: number) {
      return { timestampMs, width: 640, height: 360, previewUrl: 'blob:manual-frame' };
    }

    dispose() {
      this.instance.dispose();
    }
  },
}));

vi.mock('$paraglide/messages', () => ({
  frames_preview_loading: () => 'Preparing frame preview…',
  frames_frame_loading: () => 'Loading frame preview…',
  frames_scrubber_label: () => 'Frame timestamp',
  frames_selected_limit: () => 'You can select up to 50 frames.',
  frames_add_frame: () => 'Add frame',
}));

import FrameScrubber from './FrameScrubber.svelte';

type MediaObject = components['schemas']['MediaObject'];

const media: MediaObject = {
  media_type: 'video',
  original: {
    url: '/v1/content/outputs/output-1',
    width: 640,
    height: 360,
    content_type: 'video/mp4',
    size_bytes: 1024,
  },
  variants: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function props(
  overrides: Partial<{ media: MediaObject; timestamp: number; maxTimestamp: number }> = {},
) {
  return {
    media,
    timestamp: 0,
    maxTimestamp: 3_000,
    canAdd: true,
    onscrub: (timestampMs: number) => timestampMs,
    onadd: vi.fn().mockResolvedValue(undefined),
    addingLabel: 'Adding frame…',
    retryLabel: 'Retry frame preview',
    displayErrorLabel: 'Could not display this video frame',
    corsCaptureErrorLabel: 'Video access is blocked',
    authErrorLabel: 'Your session has expired. Please sign in again.',
    tooLargeMediaErrorLabel:
      'Live manual preview is unavailable for this video because it is too large. Automatic frames are still available.',
    ...overrides,
  };
}

let revokeObjectUrl: ReturnType<typeof vi.fn>;
let previousRevokeObjectUrl: PropertyDescriptor | undefined;

beforeEach(() => {
  loadMediaMock.mockReset();
  captures.splice(0);
  disposeMock.mockReset();
  revokeObjectUrl = vi.fn();
  previousRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  if (previousRevokeObjectUrl)
    Object.defineProperty(URL, 'revokeObjectURL', previousRevokeObjectUrl);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.restoreAllMocks();
});

describe('FrameScrubber authenticated decoder lifecycle', () => {
  it('waits for the authenticated blob before initializing the decoder or enabling Add frame', async () => {
    const pending = deferred<{ objectUrl: string; contentType: string }>();
    loadMediaMock.mockReturnValue(pending.promise);

    render(FrameScrubber, { props: props() });

    await waitFor(() => expect(loadMediaMock).toHaveBeenCalledOnce());
    expect(captures).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Add frame' }).hasAttribute('disabled')).toBe(true);

    pending.resolve({ objectUrl: 'blob:authenticated-video', contentType: 'video/mp4' });
    await waitFor(() => expect(captures).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add frame' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
  });

  it('shows a localized session error and retries media loading', async () => {
    loadMediaMock
      .mockRejectedValueOnce(new AuthenticatedMediaLoadErrorMock('authentication', 401, true))
      .mockResolvedValueOnce({ objectUrl: 'blob:retried-video', contentType: 'video/mp4' });

    render(FrameScrubber, { props: props() });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your session has expired. Please sign in again.',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Retry frame preview' }));

    await waitFor(() => expect(loadMediaMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(captures).toHaveLength(1));
  });

  it('shows the large-video message while keeping the scrubber safely disabled', async () => {
    loadMediaMock.mockRejectedValueOnce(new AuthenticatedMediaLoadErrorMock('too-large'));

    render(FrameScrubber, { props: props() });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Live manual preview is unavailable for this video because it is too large.',
    );
    expect(screen.getByRole('button', { name: 'Add frame' }).hasAttribute('disabled')).toBe(true);
  });

  it('ignores and revokes a stale media load after the source changes', async () => {
    const first = deferred<{ objectUrl: string; contentType: string }>();
    const second = deferred<{ objectUrl: string; contentType: string }>();
    loadMediaMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const rendered = render(FrameScrubber, { props: props() });

    await waitFor(() => expect(loadMediaMock).toHaveBeenCalledOnce());
    await rendered.rerender({
      ...props({
        media: {
          ...media,
          original: { ...media.original, url: '/v1/content/uploads/upload-2' },
        },
      }),
    });
    await waitFor(() => expect(loadMediaMock).toHaveBeenCalledTimes(2));

    first.resolve({ objectUrl: 'blob:stale-video', contentType: 'video/mp4' });
    await waitFor(() => expect(revokeObjectUrl).toHaveBeenCalledWith('blob:stale-video'));
    expect(captures).toHaveLength(0);

    second.resolve({ objectUrl: 'blob:current-video', contentType: 'video/mp4' });
    await waitFor(() => expect(captures).toHaveLength(1));
  });

  it('aborts in-flight work and revokes the decoder blob exactly once on destroy', async () => {
    const pending = deferred<{ objectUrl: string; contentType: string }>();
    loadMediaMock.mockReturnValue(pending.promise);
    const rendered = render(FrameScrubber, { props: props() });

    await waitFor(() => expect(loadMediaMock).toHaveBeenCalledOnce());
    const signal = loadMediaMock.mock.calls[0][1].signal as AbortSignal;
    rendered.unmount();
    expect(signal.aborted).toBe(true);

    pending.resolve({ objectUrl: 'blob:late-video', contentType: 'video/mp4' });
    await waitFor(() => expect(revokeObjectUrl).toHaveBeenCalledWith('blob:late-video'));

    loadMediaMock.mockResolvedValue({ objectUrl: 'blob:loaded-video', contentType: 'video/mp4' });
    const loaded = render(FrameScrubber, { props: props() });
    await waitFor(() => expect(captures).toHaveLength(1));
    loaded.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenLastCalledWith('blob:loaded-video');
    expect(disposeMock).toHaveBeenCalledOnce();
  });

  it('detaches the old video before revoking its blob URL on source replacement', async () => {
    const order: string[] = [];
    const first = deferred<{ objectUrl: string; contentType: string }>();
    const second = deferred<{ objectUrl: string; contentType: string }>();
    loadMediaMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    disposeMock.mockImplementation(() => order.push('dispose'));
    revokeObjectUrl.mockImplementation((url) => order.push(`revoke:${url}`));
    const rendered = render(FrameScrubber, { props: props() });

    await waitFor(() => expect(loadMediaMock).toHaveBeenCalledOnce());
    const video = rendered.container.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'pause').mockImplementation(() => order.push('pause'));
    vi.spyOn(video, 'removeAttribute').mockImplementation((name) => {
      order.push(`remove:${name}`);
      Element.prototype.removeAttribute.call(video, name);
    });
    vi.spyOn(video, 'load').mockImplementation(() => order.push('load'));

    first.resolve({ objectUrl: 'blob:source-a', contentType: 'video/mp4' });
    await waitFor(() => expect(captures).toHaveLength(1));
    await rendered.rerender({
      ...props({
        media: { ...media, original: { ...media.original, url: '/v1/content/uploads/source-b' } },
      }),
    });
    await waitFor(() => expect(loadMediaMock).toHaveBeenCalledTimes(2));

    expect(order).toEqual(['dispose', 'pause', 'remove:src', 'load', 'revoke:blob:source-a']);

    second.resolve({ objectUrl: 'blob:source-b', contentType: 'video/mp4' });
    await waitFor(() => expect(captures).toHaveLength(2));
  });

  it('clears the preview backing bitmap on replacement but not while seeking the same source', async () => {
    vi.useFakeTimers();
    loadMediaMock.mockResolvedValue({ objectUrl: 'blob:source-a', contentType: 'video/mp4' });
    const rendered = render(FrameScrubber, { props: props() });
    await vi.waitFor(() => expect(captures).toHaveLength(1));
    const canvas = rendered.container.querySelector('canvas') as HTMLCanvasElement;
    const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    const resets: number[] = [];
    Object.defineProperty(canvas, 'width', {
      configurable: true,
      get: () => widthDescriptor?.get?.call(canvas) ?? 300,
      set: (value: number) => {
        resets.push(value);
        widthDescriptor?.set?.call(canvas, value);
      },
    });

    await fireEvent.input(screen.getByRole('slider', { name: 'Frame timestamp' }), {
      target: { value: '1200' },
    });
    await vi.advanceTimersByTimeAsync(75);
    expect(resets).toHaveLength(0);

    await rendered.rerender({
      ...props({
        media: { ...media, original: { ...media.original, url: '/v1/content/uploads/source-b' } },
      }),
    });
    expect(resets.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('uses the current clamped timestamp for a replacement decoder without refetching on scrubs', async () => {
    vi.useFakeTimers();
    loadMediaMock
      .mockResolvedValueOnce({ objectUrl: 'blob:source-a', contentType: 'video/mp4' })
      .mockResolvedValueOnce({ objectUrl: 'blob:source-b', contentType: 'video/mp4' })
      .mockResolvedValueOnce({ objectUrl: 'blob:source-c', contentType: 'video/mp4' });
    const rendered = render(FrameScrubber, { props: props({ timestamp: 1_250 }) });
    await vi.waitFor(() => expect(captures).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(75);
    expect(captures[0].seek).toHaveBeenLastCalledWith(1_250);

    await rendered.rerender({
      ...props({
        media: { ...media, original: { ...media.original, url: '/v1/content/uploads/source-b' } },
        timestamp: 0,
      }),
    });
    await vi.waitFor(() => expect(captures).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(75);
    expect(captures[1].seek).toHaveBeenLastCalledWith(0);

    await rendered.rerender({
      ...props({
        media: { ...media, original: { ...media.original, url: '/v1/content/outputs/source-c' } },
        timestamp: 10_000,
        maxTimestamp: 2_000,
      }),
    });
    await vi.waitFor(() => expect(captures).toHaveLength(3));
    await vi.advanceTimersByTimeAsync(75);
    expect(captures[2].seek).toHaveBeenLastCalledWith(2_000);
    expect(loadMediaMock).toHaveBeenCalledTimes(3);

    await fireEvent.input(screen.getByRole('slider', { name: 'Frame timestamp' }), {
      target: { value: '1500' },
    });
    await vi.advanceTimersByTimeAsync(75);
    expect(captures[2].seek).toHaveBeenLastCalledWith(1_500);
    expect(loadMediaMock).toHaveBeenCalledTimes(3);
  });
});
