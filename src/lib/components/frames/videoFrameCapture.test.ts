import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  releaseFramePreview,
  VideoFrameCapture,
  type CapturedVideoFrame,
} from './videoFrameCapture';

interface CaptureFixture {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  frames: CapturedVideoFrame[];
  seeking: boolean[];
}

function createFixture(metadataReady = true): CaptureFixture {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const frames: CapturedVideoFrame[] = [];
  const seeking: boolean[] = [];
  let currentTime = 0;

  Object.defineProperty(video, 'readyState', {
    configurable: true,
    get: () => (metadataReady ? HTMLMediaElement.HAVE_METADATA : 0),
  });
  Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 640 });
  Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 360 });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });
  Object.defineProperty(video, 'requestVideoFrameCallback', {
    configurable: true,
    value: (callback: () => void) => {
      queueMicrotask(callback);
      return 1;
    },
  });
  Object.defineProperty(video, 'cancelVideoFrameCallback', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(canvas, 'toBlob', {
    configurable: true,
    value: (callback: BlobCallback) => callback(new Blob(['frame'], { type: 'image/webp' })),
  });

  return { video, canvas, frames, seeking };
}

let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  let sequence = 0;
  createObjectUrl = vi.fn(() => `blob:frame-${++sequence}`);
  revokeObjectUrl = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
});

afterEach(() => vi.unstubAllGlobals());

describe('VideoFrameCapture', () => {
  it('allows the newest seek to win when metadata and seek events arrive out of order', async () => {
    const fixture = createFixture(false);
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: (frame) => fixture.frames.push(frame),
      onSeekingChange: (isSeeking) => fixture.seeking.push(isSeeking),
    });

    const older = capture.seek(100);
    const newest = capture.seek(900);
    fixture.video.dispatchEvent(new Event('loadedmetadata'));
    await Promise.resolve();
    fixture.video.dispatchEvent(new Event('seeked'));

    await expect(older).resolves.toBeNull();
    await expect(newest).resolves.toMatchObject({ timestampMs: 900, previewUrl: 'blob:frame-1' });
    expect(fixture.frames).toHaveLength(1);
    expect(fixture.frames[0].timestampMs).toBe(900);
    expect(fixture.seeking.at(-1)).toBe(false);

    capture.dispose();
  });

  it('copies the painted frame for manual cards and releases both URLs during cleanup', async () => {
    const fixture = createFixture();
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: (frame) => fixture.frames.push(frame),
      onSeekingChange: () => undefined,
    });

    const seek = capture.seek(512);
    await Promise.resolve();
    fixture.video.dispatchEvent(new Event('seeked'));
    await seek;

    const manual = await capture.captureManualFrame(512);
    expect(manual).toMatchObject({ timestampMs: 512, previewUrl: 'blob:frame-2' });
    releaseFramePreview(manual.previewUrl);
    capture.dispose();

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:frame-2');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:frame-1');
  });

  it('surfaces canvas capture failures instead of replacing the previous preview with a black frame', async () => {
    const fixture = createFixture();
    vi.spyOn(fixture.canvas, 'getContext').mockReturnValue(null);
    const capture = new VideoFrameCapture({
      ...fixture,
      onFrame: (frame) => fixture.frames.push(frame),
      onSeekingChange: () => undefined,
    });

    const seek = capture.seek(100);
    await Promise.resolve();
    fixture.video.dispatchEvent(new Event('seeked'));

    await expect(seek).rejects.toThrow('Could not display this video frame.');
    expect(fixture.frames).toHaveLength(0);
    capture.dispose();
  });
});
