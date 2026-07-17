export interface CapturedVideoFrame {
  timestampMs: number;
  previewUrl: string;
  width: number;
  height: number;
}

interface VideoFrameCaptureOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onFrame: (frame: CapturedVideoFrame) => void;
  onSeekingChange: (seeking: boolean) => void;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** Release previews created by this module. Data URLs intentionally need no cleanup. */
export function releaseFramePreview(previewUrl: string): void {
  if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
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

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not capture this video frame.'));
      },
      'image/webp',
      0.92,
    );
  });
}

/**
 * Keeps one decoder video and one canvas. A request number makes every seek
 * latest-only, so a late `seeked` event can never replace a newer preview.
 */
export class VideoFrameCapture {
  private readonly video: VideoWithFrameCallback;
  private readonly canvas: HTMLCanvasElement;
  private readonly onFrame: (frame: CapturedVideoFrame) => void;
  private readonly onSeekingChange: (seeking: boolean) => void;
  private requestVersion = 0;
  private disposed = false;
  private pendingCleanup: (() => void) | null = null;
  private activeFrame: CapturedVideoFrame | null = null;

  constructor({ video, canvas, onFrame, onSeekingChange }: VideoFrameCaptureOptions) {
    this.video = video;
    this.canvas = canvas;
    this.onFrame = onFrame;
    this.onSeekingChange = onSeekingChange;
  }

  /** Invalidates a debounced request before it can draw an obsolete frame. */
  supersede(): void {
    this.requestVersion += 1;
    this.cancelPending();
  }

  async seek(timestampMs: number): Promise<CapturedVideoFrame | null> {
    const version = ++this.requestVersion;
    this.cancelPending();
    this.onSeekingChange(true);

    try {
      const metadataReady = await this.waitForMetadata();
      if (!metadataReady || !this.isCurrent(version)) return null;

      const decoded = this.waitForDecodedFrame();
      this.video.currentTime = timestampMs / 1_000;
      const frameReady = await decoded;
      if (!frameReady || !this.isCurrent(version)) return null;

      const frame = await this.snapshot(timestampMs);
      if (!this.isCurrent(version)) {
        releaseFramePreview(frame.previewUrl);
        return null;
      }

      if (this.activeFrame) releaseFramePreview(this.activeFrame.previewUrl);
      this.activeFrame = frame;
      this.onFrame(frame);
      return frame;
    } finally {
      if (this.isCurrent(version)) this.onSeekingChange(false);
    }
  }

  /** Copies the currently painted canvas for a manual card. */
  async captureManualFrame(timestampMs: number): Promise<CapturedVideoFrame> {
    if (!this.activeFrame || this.activeFrame.timestampMs !== timestampMs) {
      throw new Error('The requested video frame is not ready yet.');
    }
    return this.snapshot(timestampMs);
  }

  dispose(): void {
    this.disposed = true;
    this.requestVersion += 1;
    this.cancelPending();
    if (this.activeFrame) releaseFramePreview(this.activeFrame.previewUrl);
    this.activeFrame = null;
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
      const timer = window.setTimeout(
        () => finish(new Error('Video metadata did not load in time.')),
        8_000,
      );
      const finish = (error?: Error, ready = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.video.removeEventListener('loadedmetadata', onMetadata);
        this.video.removeEventListener('error', onError);
        if (this.pendingCleanup === cancel) this.pendingCleanup = null;
        if (error) reject(error);
        else resolve(ready);
      };
      const onMetadata = () => finish(undefined, true);
      const onError = () => finish(new Error('Could not decode this video.'));
      const cancel = () => finish(undefined, false);

      this.video.addEventListener('loadedmetadata', onMetadata, { once: true });
      this.video.addEventListener('error', onError, { once: true });
      this.pendingCleanup = cancel;
    });
  }

  private waitForDecodedFrame(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let frameCallbackHandle: number | null = null;
      const timer = window.setTimeout(
        () => finish(new Error('Video frame decoding timed out.')),
        8_000,
      );
      const finish = (error?: Error, ready = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.video.removeEventListener('seeked', onSeeked);
        this.video.removeEventListener('error', onError);
        if (frameCallbackHandle !== null) {
          this.video.cancelVideoFrameCallback?.(frameCallbackHandle);
        }
        if (this.pendingCleanup === cancel) this.pendingCleanup = null;
        if (error) reject(error);
        else resolve(ready);
      };
      const onSeeked = () => {
        if (this.video.requestVideoFrameCallback) {
          frameCallbackHandle = this.video.requestVideoFrameCallback(() => finish(undefined, true));
        } else {
          void nextPaint().then(() => finish(undefined, true));
        }
      };
      const onError = () => finish(new Error('Could not decode this video frame.'));
      const cancel = () => finish(undefined, false);

      this.video.addEventListener('seeked', onSeeked, { once: true });
      this.video.addEventListener('error', onError, { once: true });
      this.pendingCleanup = cancel;
    });
  }

  private async snapshot(timestampMs: number): Promise<CapturedVideoFrame> {
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (width < 1 || height < 1) throw new Error('Could not display this video frame.');

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not display this video frame.');
    this.canvas.width = width;
    this.canvas.height = height;
    context.drawImage(this.video, 0, 0, width, height);
    const blob = await canvasBlob(this.canvas);

    return {
      timestampMs,
      previewUrl: URL.createObjectURL(blob),
      width,
      height,
    };
  }
}
