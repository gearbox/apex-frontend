import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FRAME_PREVIEW_LONG_EDGE,
  VideoFrameCapture,
  type RenderedVideoFrame,
  scaledFrameDimensions,
} from './videoFrameCapture';

interface CaptureFixture {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  frames: RenderedVideoFrame[];
  seeking: boolean[];
  cancelFrameCallback: ReturnType<typeof vi.fn>;
  emitNextFrame: () => void;
  emitFrame: (handle: number) => void;
  setReadyState: (value: number) => void;
}

function createFixture({
  readyState = HTMLMediaElement.HAVE_CURRENT_DATA,
  width = 640,
  height = 360,
  withVideoFrameCallback = true,
}: {
  readyState?: number;
  width?: number;
  height?: number;
  withVideoFrameCallback?: boolean;
} = {}): CaptureFixture {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const frames: RenderedVideoFrame[] = [];
  const seeking: boolean[] = [];
  const frameCallbacks = new Map<number, () => void>();
  const cancelFrameCallback = vi.fn((handle: number) => frameCallbacks.delete(handle));
  let nextHandle = 0;
  let currentTime = 0;
  let nextReadyState = readyState;

  Object.defineProperty(video, 'readyState', {
    configurable: true,
    get: () => nextReadyState,
  });
  Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => width });
  Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => height });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    // Deliberately no seeked event: no-op seeks must behave like real media.
    set: (value: number) => {
      currentTime = value;
    },
  });
  if (withVideoFrameCallback) {
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      configurable: true,
      value: (callback: () => void) => {
        const handle = ++nextHandle;
        frameCallbacks.set(handle, callback);
        return handle;
      },
    });
    Object.defineProperty(video, 'cancelVideoFrameCallback', {
      configurable: true,
      value: cancelFrameCallback,
    });
  }
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);

  return {
    video,
    canvas,
    frames,
    seeking,
    cancelFrameCallback,
    emitNextFrame: () => {
      const entry = frameCallbacks.entries().next().value as [number, () => void] | undefined;
      if (!entry) throw new Error('No video frame callback is pending');
      frameCallbacks.delete(entry[0]);
      entry[1]();
    },
    emitFrame: (handle) => frameCallbacks.get(handle)?.(),
    setReadyState: (value) => {
      nextReadyState = value;
    },
  };
}

let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  let sequence = 0;
  createObjectUrl = vi.fn(() => `blob:frame-${++sequence}`);
  revokeObjectUrl = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VideoFrameCapture', () => {
  it('renders the initial zero timestamp without waiting for a no-op seeked event', async () => {
    const fixture = createFixture();
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: (frame) => fixture.frames.push(frame),
      onSeekingChange: (isSeeking) => fixture.seeking.push(isSeeking),
    });

    const seek = capture.seek(0);
    await Promise.resolve();
    fixture.emitNextFrame();

    await expect(seek).resolves.toMatchObject({ timestampMs: 0 });
    expect(fixture.frames).toHaveLength(1);
    expect(fixture.seeking.at(-1)).toBe(false);
    capture.dispose();
  });

  it('renders a repeated same-timestamp capture and a genuine changed-time seek', async () => {
    const fixture = createFixture();
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: (frame) => fixture.frames.push(frame),
      onSeekingChange: () => undefined,
    });

    const first = capture.seek(0);
    await Promise.resolve();
    fixture.emitNextFrame();
    await first;

    const repeated = capture.seek(0);
    await Promise.resolve();
    fixture.emitNextFrame();
    await expect(repeated).resolves.toMatchObject({ timestampMs: 0 });

    const changed = capture.seek(900);
    await Promise.resolve();
    fixture.emitNextFrame();
    await expect(changed).resolves.toMatchObject({ timestampMs: 900 });
    expect(fixture.frames.map((frame) => frame.timestampMs)).toEqual([0, 0, 900]);
    capture.dispose();
  });

  it('uses media readiness and a paint fallback when requestVideoFrameCallback is unavailable', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0));
      return 1;
    });
    const fixture = createFixture({ withVideoFrameCallback: false });
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: (frame) => fixture.frames.push(frame),
      onSeekingChange: () => undefined,
    });

    await expect(capture.seek(0)).resolves.toMatchObject({ timestampMs: 0 });
    expect(fixture.frames).toHaveLength(1);
    capture.dispose();
  });

  it('allows only the latest request to paint and cancels its stale frame callback', async () => {
    const fixture = createFixture();
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: (frame) => fixture.frames.push(frame),
      onSeekingChange: () => undefined,
    });

    const older = capture.seek(100);
    await Promise.resolve();
    const newest = capture.seek(900);
    await Promise.resolve();
    fixture.emitNextFrame();

    await expect(older).resolves.toBeNull();
    await expect(newest).resolves.toMatchObject({ timestampMs: 900 });
    expect(fixture.cancelFrameCallback).toHaveBeenCalledWith(1);
    expect(fixture.frames).toHaveLength(1);
    capture.dispose();
  });

  it('waits for delayed metadata and settles disposal during metadata wait', async () => {
    const fixture = createFixture({ readyState: 0 });
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: (frame) => fixture.frames.push(frame),
      onSeekingChange: () => undefined,
    });

    const seek = capture.seek(0);
    fixture.setReadyState(HTMLMediaElement.HAVE_CURRENT_DATA);
    fixture.video.dispatchEvent(new Event('loadedmetadata'));
    await Promise.resolve();
    fixture.emitNextFrame();
    await expect(seek).resolves.toMatchObject({ timestampMs: 0 });

    const waitingFixture = createFixture({ readyState: 0 });
    const waitingCapture = new VideoFrameCapture({
      ...waitingFixture,
      onFrame: () => undefined,
      onSeekingChange: () => undefined,
    });
    const waiting = waitingCapture.seek(0);
    waitingCapture.dispose();
    await expect(waiting).resolves.toBeNull();
    capture.dispose();
  });

  it('settles timeout and media error paths without replacing the active canvas', async () => {
    vi.useFakeTimers();
    const timeoutFixture = createFixture({ withVideoFrameCallback: false });
    const timeoutCapture = new VideoFrameCapture({
      ...timeoutFixture,
      onFrame: () => undefined,
      onSeekingChange: () => undefined,
    });
    const timeout = timeoutCapture.seek(100);
    await Promise.resolve();
    const timeoutAssertion = expect(timeout).rejects.toMatchObject({ code: 'frame-timeout' });
    await vi.advanceTimersByTimeAsync(8_000);
    await timeoutAssertion;
    timeoutCapture.dispose();

    const errorFixture = createFixture();
    const errorCapture = new VideoFrameCapture({
      ...errorFixture,
      onFrame: () => undefined,
      onSeekingChange: () => undefined,
    });
    const errored = errorCapture.seek(100);
    await Promise.resolve();
    const errorAssertion = expect(errored).rejects.toMatchObject({ code: 'media-error' });
    errorFixture.video.dispatchEvent(new Event('error'));
    await errorAssertion;
    errorCapture.dispose();
  });

  it('settles disposal during decoded-frame wait and cancels its outstanding callback', async () => {
    const fixture = createFixture();
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: () => undefined,
      onSeekingChange: () => undefined,
    });

    const seek = capture.seek(100);
    await Promise.resolve();
    capture.dispose();

    await expect(seek).resolves.toBeNull();
    expect(fixture.cancelFrameCallback).toHaveBeenCalledWith(1);
  });

  it('caps landscape, portrait, square, and very large preview dimensions without upscaling', () => {
    expect(scaledFrameDimensions(640, 360)).toEqual({ width: 640, height: 360 });
    expect(scaledFrameDimensions(3840, 2160)).toEqual({ width: 960, height: 540 });
    expect(scaledFrameDimensions(2160, 3840)).toEqual({ width: 540, height: 960 });
    expect(scaledFrameDimensions(2000, 2000)).toEqual({
      width: MAX_FRAME_PREVIEW_LONG_EDGE,
      height: MAX_FRAME_PREVIEW_LONG_EDGE,
    });
    expect(scaledFrameDimensions(8000, 1000).width).toBe(MAX_FRAME_PREVIEW_LONG_EDGE);
  });

  it('encodes a manual thumbnail at preview resolution, falls back to PNG, and normalizes a tainted canvas', async () => {
    const fixture = createFixture({ width: 3840, height: 2160 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, type) =>
        callback(type === 'image/webp' ? null : new Blob(['png'])),
      );
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: () => undefined,
      onSeekingChange: () => undefined,
    });

    const seek = capture.seek(0);
    await Promise.resolve();
    fixture.emitNextFrame();
    await seek;
    const manual = await capture.captureManualFrame(0);
    expect(manual).toMatchObject({ width: 960, height: 540, previewUrl: 'blob:frame-1' });
    expect(toBlob).toHaveBeenNthCalledWith(1, expect.any(Function), 'image/webp', 0.88);
    expect(toBlob).toHaveBeenNthCalledWith(2, expect.any(Function), 'image/png', 0.88);

    toBlob.mockImplementation(() => {
      throw new DOMException('tainted', 'SecurityError');
    });
    await expect(capture.captureManualFrame(0)).rejects.toMatchObject({
      code: 'canvas-not-origin-clean',
    });
    capture.dispose();
  });
});
