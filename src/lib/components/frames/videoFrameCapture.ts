import { encodeFrame } from './frameEncoding';
export interface RenderedVideoFrame {
  requestedTimestampMs: number;
  timestampMs: number;
  width: number;
  height: number;
}

export interface CapturedVideoFrame extends RenderedVideoFrame {
  previewUrl: string;
}

interface VideoFrameCaptureOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  fullCanvas?: HTMLCanvasElement;
  durationMs?: number;
  clock?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
  onFrame: (frame: RenderedVideoFrame) => void;
  onSeekingChange: (seeking: boolean) => void;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameCallbackMetadata) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

type VideoFrameCaptureErrorCode =
  | 'timeout'
  | 'aborted'
  | 'metadata-timeout'
  | 'frame-timeout'
  | 'media-error'
  | 'frame-unavailable'
  | 'canvas-unavailable'
  | 'canvas-not-origin-clean'
  | 'canvas-encode-failed'
  | 'frame-not-ready';

/**
 * The code is intentionally safe for diagnostics and tests. UI code should map
 * it to translated copy instead of exposing a browser or decoder exception.
 */
export class VideoFrameCaptureError extends Error {
  readonly cause: unknown;

  constructor(
    readonly code: VideoFrameCaptureErrorCode,
    cause?: unknown,
  ) {
    super(code);
    this.name = 'VideoFrameCaptureError';
    this.cause = cause;
  }
}

export const MAX_FRAME_PREVIEW_LONG_EDGE = 960;
const MAX_FRAME_PREVIEW_PIXELS = 1_000_000;
const SEEK_EPSILON_SECONDS = 0.05;
const READY_TIMEOUT_MS = 8_000;

/** Release previews created for manual cards. Canvas previews need no cleanup. */
export function releaseFramePreview(previewUrl: string): void {
  if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
}

export function scaledFrameDimensions(
  sourceWidth: number,
  sourceHeight: number,
): {
  width: number;
  height: number;
} {
  if (sourceWidth < 1 || sourceHeight < 1) return { width: 0, height: 0 };

  const longEdgeScale = Math.min(
    1,
    MAX_FRAME_PREVIEW_LONG_EDGE / Math.max(sourceWidth, sourceHeight),
  );
  const pixelScale = Math.min(
    1,
    Math.sqrt(MAX_FRAME_PREVIEW_PIXELS / (sourceWidth * sourceHeight)),
  );
  const scale = Math.min(longEdgeScale, pixelScale);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function isCanvasSecurityError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'SecurityError';
}

function encodeCanvas(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(resolve, type, 0.88);
    } catch (error) {
      reject(error);
    }
  });
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  try {
    const webp = await encodeCanvas(canvas, 'image/webp');
    if (webp) return webp;

    const png = await encodeCanvas(canvas, 'image/png');
    if (png) return png;
  } catch (error) {
    if (isCanvasSecurityError(error)) {
      throw new VideoFrameCaptureError('canvas-not-origin-clean', error);
    }
    throw new VideoFrameCaptureError('canvas-encode-failed', error);
  }

  throw new VideoFrameCaptureError('canvas-encode-failed');
}

/**
 * Owns a decoder video and a live canvas. Requests are latest-only: a stale
 * media callback is cancelled or ignored before it can replace the visible
 * canvas. The canvas remains painted while the next frame is pending.
 */
export class VideoFrameCapture {
  private readonly video: VideoWithFrameCallback;
  private readonly canvas: HTMLCanvasElement;
  private readonly onFrame: (frame: RenderedVideoFrame) => void;
  private readonly onSeekingChange: (seeking: boolean) => void;
  private readonly fullCanvas: HTMLCanvasElement;
  private readonly durationMs: number;
  private readonly clock: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
  private presentedTime: number | null = null;
  private requestVersion = 0;
  private disposed = false;
  private pendingCleanup: (() => void) | null = null;
  private activeFrame: RenderedVideoFrame | null = null;

  constructor({
    video,
    canvas,
    fullCanvas,
    durationMs = Infinity,
    clock = globalThis,
    onFrame,
    onSeekingChange,
  }: VideoFrameCaptureOptions) {
    this.video = video;
    this.canvas = canvas;
    this.fullCanvas = fullCanvas ?? canvas.ownerDocument.createElement('canvas');
    this.durationMs = durationMs;
    this.clock = clock;
    this.onFrame = onFrame;
    this.onSeekingChange = onSeekingChange;
  }

  /** Invalidates a debounced request before it can draw an obsolete frame. */
  supersede(): void {
    this.requestVersion += 1;
    this.cancelPending();
  }

  async seek(timestampMs: number): Promise<RenderedVideoFrame | null> {
    const version = ++this.requestVersion;
    this.cancelPending();
    this.onSeekingChange(true);

    try {
      const metadataReady = await this.waitForMetadata();
      if (!metadataReady || !this.isCurrent(version)) return null;

      this.presentedTime = null;
      const frameReady = await this.waitForDecodedFrame(timestampMs / 1_000);
      if (!frameReady || !this.isCurrent(version)) return null;

      const frame = this.drawFrame(timestampMs);
      if (!this.isCurrent(version)) return null;

      this.activeFrame = frame;
      this.onFrame(frame);
      return frame;
    } finally {
      if (this.isCurrent(version)) this.onSeekingChange(false);
    }
  }

  /**
   * Encodes only an explicitly added manual card. The live preview never
   * creates a blob while the user is scrubbing.
   */
  async captureManualFrame(timestampMs: number): Promise<CapturedVideoFrame> {
    if (!this.activeFrame || this.activeFrame.timestampMs !== timestampMs) {
      throw new VideoFrameCaptureError('frame-not-ready');
    }

    const manualCanvas = this.canvas.ownerDocument.createElement('canvas');
    manualCanvas.width = this.canvas.width;
    manualCanvas.height = this.canvas.height;
    const context = manualCanvas.getContext('2d');
    if (!context) throw new VideoFrameCaptureError('canvas-unavailable');
    context.drawImage(this.canvas, 0, 0, manualCanvas.width, manualCanvas.height);
    let blob: Blob;
    try {
      blob = await canvasBlob(manualCanvas);
    } finally {
      manualCanvas.width = manualCanvas.height = 0;
    }
    if (this.disposed) throw new VideoFrameCaptureError('aborted');

    return {
      ...this.activeFrame,
      timestampMs,
      previewUrl: URL.createObjectURL(blob),
    };
  }

  async captureFullResolution(): Promise<Blob> {
    if (!this.activeFrame || this.disposed) throw new VideoFrameCaptureError('frame-not-ready');
    const canvas = this.fullCanvas;
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new VideoFrameCaptureError('canvas-unavailable');
      context.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      return await encodeFrame(canvas);
    } finally {
      canvas.width = canvas.height = 0;
    }
  }

  checkOriginClean(): void {
    try {
      this.canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
    } catch (error) {
      throw new VideoFrameCaptureError(
        isCanvasSecurityError(error) ? 'canvas-not-origin-clean' : 'canvas-unavailable',
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    this.requestVersion += 1;
    this.cancelPending();
    this.activeFrame = null;
    this.canvas.width = this.canvas.height = 0;
    this.fullCanvas.width = this.fullCanvas.height = 0;
  }

  private isCurrent(version: number): boolean {
    return !this.disposed && version === this.requestVersion;
  }

  private cancelPending(): void {
    this.pendingCleanup?.();
    this.pendingCleanup = null;
  }

  private waitForMetadata(): Promise<boolean> {
    if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve(true);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: VideoFrameCaptureError, ready = false) => {
        if (settled) return;
        settled = true;
        this.clock.clearTimeout(timer);
        this.video.removeEventListener('loadedmetadata', onMetadata);
        this.video.removeEventListener('error', onError);
        if (this.pendingCleanup === cancel) this.pendingCleanup = null;
        if (error) reject(error);
        else resolve(ready);
      };
      const onMetadata = () => finish(undefined, true);
      const onError = () => finish(new VideoFrameCaptureError('media-error'));
      const cancel = () => finish(undefined, false);
      const timer = this.clock.setTimeout(
        () => finish(new VideoFrameCaptureError('metadata-timeout')),
        READY_TIMEOUT_MS,
      );

      this.video.addEventListener('loadedmetadata', onMetadata, { once: true });
      this.video.addEventListener('error', onError, { once: true });
      this.pendingCleanup = cancel;
    });
  }

  /**
   * Registers decoded-frame observation before assigning currentTime. A media
   * frame callback wins when available; readiness plus a rendering tick keeps
   * paused WebKit and same-time seeks from waiting for a synthetic `seeked`.
   */
  private waitForDecodedFrame(targetSeconds: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let frameCallbackHandle: number | null = null;
      let paintScheduled = false;
      let seekObserved = this.isAtTimestamp(targetSeconds);

      const hasCurrentFrame = () =>
        !this.video.seeking && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      const isReadyAtTarget = () => hasCurrentFrame() && this.isAtTimestamp(targetSeconds);

      const finish = (error?: VideoFrameCaptureError, ready = false) => {
        if (settled) return;
        settled = true;
        this.clock.clearTimeout(timer);
        this.video.removeEventListener('seeked', onSeeked);
        this.video.removeEventListener('loadeddata', onReadyState);
        this.video.removeEventListener('canplay', onReadyState);
        this.video.removeEventListener('error', onError);
        if (frameCallbackHandle !== null) {
          this.video.cancelVideoFrameCallback?.(frameCallbackHandle);
          frameCallbackHandle = null;
        }
        if (this.pendingCleanup === cancel) this.pendingCleanup = null;
        if (error) reject(error);
        else resolve(ready);
      };

      const schedulePaint = () => {
        if (paintScheduled || settled) return;
        paintScheduled = true;
        void nextPaint().then(() => {
          paintScheduled = false;
          if (isReadyAtTarget()) finish(undefined, true);
        });
      };

      const observeDecodedFrame = () => {
        if (!this.video.requestVideoFrameCallback || settled || frameCallbackHandle !== null)
          return;
        frameCallbackHandle = this.video.requestVideoFrameCallback((_now, metadata) => {
          frameCallbackHandle = null;
          if (isReadyAtTarget()) {
            this.presentedTime = metadata?.mediaTime ?? this.video.currentTime;
            finish(undefined, true);
          } else {
            observeDecodedFrame();
          }
        });
      };

      const maybeReady = () => {
        if (!isReadyAtTarget()) return;
        // requestVideoFrameCallback is registered first. The paint is a
        // bounded fallback for paused Safari/WebKit, where no new callback can
        // arrive after a frame is already presented.
        observeDecodedFrame();
        if (seekObserved) schedulePaint();
      };

      const onSeeked = () => {
        seekObserved = true;
        maybeReady();
      };
      const onReadyState = () => maybeReady();
      const onError = () => finish(new VideoFrameCaptureError('media-error'));
      const cancel = () => finish(undefined, false);
      const timer = this.clock.setTimeout(
        () => finish(new VideoFrameCaptureError('frame-timeout')),
        READY_TIMEOUT_MS,
      );

      this.video.addEventListener('seeked', onSeeked);
      this.video.addEventListener('loadeddata', onReadyState);
      this.video.addEventListener('canplay', onReadyState);
      this.video.addEventListener('error', onError, { once: true });
      this.pendingCleanup = cancel;

      // This must happen before currentTime is assigned. A callback that runs
      // before a changed seek simply re-registers until the target is current.
      observeDecodedFrame();
      try {
        this.video.currentTime = targetSeconds;
      } catch (error) {
        finish(new VideoFrameCaptureError('media-error', error));
        return;
      }
      maybeReady();
    });
  }

  private isAtTimestamp(targetSeconds: number): boolean {
    return Math.abs(this.video.currentTime - targetSeconds) <= SEEK_EPSILON_SECONDS;
  }

  private drawFrame(timestampMs: number): RenderedVideoFrame {
    const sourceWidth = this.video.videoWidth;
    const sourceHeight = this.video.videoHeight;
    const { width, height } = scaledFrameDimensions(sourceWidth, sourceHeight);
    if (width < 1 || height < 1) throw new VideoFrameCaptureError('frame-unavailable');

    const context = this.canvas.getContext('2d');
    if (!context) throw new VideoFrameCaptureError('canvas-unavailable');
    this.canvas.width = width;
    this.canvas.height = height;
    context.drawImage(this.video, 0, 0, width, height);

    return {
      requestedTimestampMs: timestampMs,
      timestampMs: Math.min(
        this.durationMs,
        Math.max(0, Math.round((this.presentedTime ?? this.video.currentTime) * 1000)),
      ),
      width,
      height,
    };
  }
}
