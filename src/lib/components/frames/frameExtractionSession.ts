import { uploadMedia, type UploadResponse } from '$lib/api/upload';
import { ApiRequestError } from '$lib/api/errors';
import type { components } from '$lib/api/types';
import { parseAssetRef } from '$lib/utils/assetRef';
import { parseProtectedContentUrl } from '$lib/media/protectedContent';
import { recoverFromMediaError, type MediaFailure } from '$lib/media/mediaErrorRecovery';
import { frameFilename } from './frameEncoding';
import {
  VideoFrameCapture,
  VideoFrameCaptureError,
  releaseFramePreview,
  type CapturedVideoFrame,
  type RenderedVideoFrame,
} from './videoFrameCapture';

export const DEFAULT_FRAME_PREVIEW_COUNT = 6;
export interface LocalPreviewFrame extends CapturedVideoFrame {
  id: string;
}
export interface ExtractedLocalFrame extends UploadResponse {
  timestampMs: number;
}
export class FrameSessionError extends Error {
  constructor(readonly failure: MediaFailure) {
    super(failure);
  }
}
interface SessionOptions {
  assetRef: string;
  media: components['schemas']['MediaObject'];
  createVideo?: () => HTMLVideoElement;
  createCanvas?: () => HTMLCanvasElement;
  upload?: typeof uploadMedia;
  recover?: typeof recoverFromMediaError;
  onFailure?: (error: unknown) => void;
  clock?: {
    setTimeout: typeof globalThis.setTimeout;
    clearTimeout: typeof globalThis.clearTimeout;
  };
}

export function automaticTimestamps(maxTimestamp: number): number[] {
  return [
    ...new Set(
      Array.from({ length: DEFAULT_FRAME_PREVIEW_COUNT }, (_, i) =>
        Math.round((i * (maxTimestamp + 1)) / DEFAULT_FRAME_PREVIEW_COUNT),
      ).map((t) => Math.min(maxTimestamp, t)),
    ),
  ];
}

function canonicalAssetRef(assetRef: string): string {
  const { source, id } = parseAssetRef(assetRef);
  return `${source}:${id.toLowerCase()}`;
}

/** One native decoder and two reusable canvases for the lifetime of the modal. */
export class FrameExtractionSession {
  readonly canvas: HTMLCanvasElement;
  readonly fullCanvas: HTMLCanvasElement;
  readonly signal: AbortSignal;
  previews: LocalPreviewFrame[] = [];
  results: ExtractedLocalFrame[] = [];
  progress = { done: 0, total: 0 };
  frame: RenderedVideoFrame | null = null;
  seeking = false;
  maxTimestamp = 0;
  private video: HTMLVideoElement;
  private capture: VideoFrameCapture;
  private readonly abort = new AbortController();
  private readonly completed = new Set<number>();
  private readonly urls = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private retried = false;
  private originCleanChecked = false;
  private readonly assetRefMatchesMedia: boolean;
  private stale = false;
  private extracting = false;
  private operationActive = false;
  private scrubVersion = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly clock;
  private readonly durationMs: number | null;
  private readonly target;
  private readonly upload;
  private readonly recover;
  private readonly createVideo;

  constructor(private readonly options: SessionOptions) {
    this.signal = this.abort.signal;
    this.clock = options.clock ?? globalThis;
    this.durationMs = options.media.original.duration_ms ?? null;
    try {
      this.assetRefMatchesMedia =
        options.media.asset_ref == null ||
        canonicalAssetRef(options.media.asset_ref) === canonicalAssetRef(options.assetRef);
    } catch {
      this.assetRefMatchesMedia = false;
    }
    this.target = parseProtectedContentUrl(options.media.original.url);
    this.upload = options.upload ?? uploadMedia;
    this.recover = options.recover ?? recoverFromMediaError;
    this.createVideo = options.createVideo ?? (() => document.createElement('video'));
    const createCanvas = options.createCanvas ?? (() => document.createElement('canvas'));
    this.canvas = createCanvas();
    this.fullCanvas = createCanvas();
    this.video = this.createVideo();
    this.capture = this.makeCapture();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    listener();
    return () => this.listeners.delete(listener);
  }
  private notify() {
    if (!this.signal.aborted) this.listeners.forEach((listener) => listener());
  }
  private assertCurrent(generation = this.generation) {
    if (this.signal.aborted || generation !== this.generation)
      throw new FrameSessionError('aborted');
  }
  private makeCapture() {
    return new VideoFrameCapture({
      video: this.video,
      canvas: this.canvas,
      fullCanvas: this.fullCanvas,
      durationMs: this.durationMs ?? 0,
      clock: this.clock,
      onFrame: (frame) => {
        this.frame = frame;
        this.notify();
      },
      onSeekingChange: (seeking) => {
        this.seeking = seeking;
        this.notify();
      },
    });
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const next = this.queue.then(async () => {
      this.assertCurrent(generation);
      this.operationActive = true;
      try {
        return await operation();
      } finally {
        this.operationActive = false;
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
  mountVideo(host: HTMLElement) {
    this.video.className = 'pointer-events-none absolute h-px w-px opacity-0';
    this.video.setAttribute('aria-hidden', 'true');
    host.append(this.video);
  }
  private loadVideo() {
    if (this.durationMs === null) throw new FrameSessionError('unavailable');
    if (!this.target) throw new FrameSessionError('not-found');
    this.originCleanChecked = false;
    this.video.addEventListener('error', this.onNativeError);
    this.video.crossOrigin = 'use-credentials';
    this.video.preload = 'metadata';
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.src = this.target.url;
    this.video.load();
  }
  private updateTimeline() {
    const decoded = this.video.duration * 1000;
    const server = this.durationMs ?? 0;
    this.maxTimestamp = Math.max(
      0,
      Math.floor(Math.min(Number.isFinite(decoded) && decoded > 0 ? decoded : server, server)) - 1,
    );
    if (import.meta.env.DEV && Number.isFinite(decoded) && Math.abs(decoded - server) > 1000)
      console.warn('Frame extraction: decoded duration differs from lineage duration');
  }
  private waitUntilVisible(): Promise<void> {
    if (document.visibilityState !== 'hidden') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        document.removeEventListener('visibilitychange', visible);
        this.signal.removeEventListener('abort', aborted);
      };
      const visible = () => {
        if (document.visibilityState === 'hidden') return;
        cleanup();
        resolve();
      };
      const aborted = () => {
        cleanup();
        reject(new FrameSessionError('aborted'));
      };
      document.addEventListener('visibilitychange', visible);
      this.signal.addEventListener('abort', aborted, { once: true });
      if (this.signal.aborted) aborted();
    });
  }
  private async seekFrame(timestampMs: number): Promise<RenderedVideoFrame> {
    this.assertCurrent();
    await this.waitUntilVisible();
    this.assertCurrent();
    if (this.stale) {
      this.stale = false;
      const host = this.video.parentElement;
      this.teardownVideo();
      this.video = this.createVideo();
      this.capture = this.makeCapture();
      this.retried = false;
      if (host) this.mountVideo(host);
      this.loadVideo();
      await this.seekFrame(0);
      if (timestampMs !== 0) return this.seekFrame(timestampMs);
    }
    try {
      if (this.video.error) throw new VideoFrameCaptureError('media-error');
      // Metadata must be read before clamping a nonzero seek after a reload.
      const frame = await this.capture.seek(Math.min(this.maxTimestamp, Math.max(0, timestampMs)));
      this.assertCurrent();
      if (!frame) {
        if (this.stale) return this.seekFrame(timestampMs);
        throw new FrameSessionError('aborted');
      }
      if (this.video.videoWidth <= 0 || this.video.videoHeight <= 0)
        throw new FrameSessionError('unsupported');
      this.updateTimeline();
      if (!this.originCleanChecked) {
        this.capture.checkOriginClean();
        this.originCleanChecked = true;
      }
      this.retried = false;
      return frame;
    } catch (error) {
      this.assertCurrent();
      if (
        document.visibilityState === 'hidden' &&
        error instanceof VideoFrameCaptureError &&
        ['metadata-timeout', 'frame-timeout', 'media-error'].includes(error.code)
      ) {
        await this.waitUntilVisible();
        return this.seekFrame(timestampMs);
      }
      if (error instanceof VideoFrameCaptureError && error.code === 'media-error' && this.target) {
        const result = await this.recover(this.target, this.video.error, { signal: this.signal });
        this.assertCurrent();
        if (result.retry) {
          if (this.retried) {
            throw new FrameSessionError('authentication');
          }
          this.retried = true;
          this.video.load();
          return this.seekFrame(timestampMs);
        }
        throw new FrameSessionError(result.failure);
      }
      if (error instanceof VideoFrameCaptureError) {
        if (error.code === 'metadata-timeout' || error.code === 'frame-timeout')
          throw new FrameSessionError('timeout');
        if (error.code === 'frame-unavailable') throw new FrameSessionError('unsupported');
        if (error.code === 'canvas-not-origin-clean')
          throw new FrameSessionError('canvas-not-origin-clean');
      }
      throw error;
    }
  }

  load(): Promise<LocalPreviewFrame[]> {
    return this.serial(async () => {
      if (!this.assetRefMatchesMedia) throw new FrameSessionError('unavailable');
      parseAssetRef(this.options.assetRef);
      this.loadVideo();
      this.previews.forEach((frame) => this.release(frame.previewUrl));
      this.previews = [];
      const first = await this.seekFrame(0);
      const seen = new Set<number>();
      for (const timestamp of automaticTimestamps(this.maxTimestamp)) {
        const frame = timestamp === 0 ? first : await this.seekFrame(timestamp);
        if (seen.has(frame.timestampMs)) continue;
        seen.add(frame.timestampMs);
        const preview = await this.capture.captureManualFrame(frame.timestampMs);
        this.assertCurrent();
        this.urls.add(preview.previewUrl);
        this.previews.push({ ...preview, id: `auto-${preview.timestampMs}` });
      }
      await this.seekFrame(0);
      return this.previews;
    });
  }
  scrub(timestampMs: number, onError: (error: unknown) => void): void {
    if (this.extracting || this.signal.aborted) return;
    const version = ++this.scrubVersion;
    if (this.seekTimer) this.clock.clearTimeout(this.seekTimer);
    this.capture.supersede();
    this.seeking = true;
    this.notify();
    this.seekTimer = this.clock.setTimeout(() => {
      this.seekTimer = null;
      void this.serial(async () => {
        if (version !== this.scrubVersion) return;
        return this.seekFrame(timestampMs);
      }).catch((error) => {
        if (this.signal.aborted || version !== this.scrubVersion) return;
        this.seeking = false;
        this.notify();
        onError(error);
      });
    }, 75);
  }
  addFrame(): Promise<CapturedVideoFrame> {
    return this.serial(async () => {
      if (this.seeking || !this.frame || this.extracting)
        throw new VideoFrameCaptureError('frame-not-ready');
      const frame = await this.capture.captureManualFrame(this.frame.timestampMs);
      this.assertCurrent();
      this.urls.add(frame.previewUrl);
      return frame;
    });
  }
  release(url: string) {
    if (this.urls.delete(url)) releaseFramePreview(url);
  }

  extract(timestamps: number[], invalidate: () => void): Promise<ExtractedLocalFrame[]> {
    // Freeze selection and cancel debounced work synchronously, before entering the queue.
    const selection = [...new Set(timestamps)].sort((a, b) => a - b);
    if (selection.length > 50 || this.extracting)
      return Promise.reject(new Error('invalid-selection'));
    this.extracting = true;
    this.progress = {
      done: selection.filter((timestamp) => this.completed.has(timestamp)).length,
      total: selection.length,
    };
    this.notify();
    this.scrubVersion++;
    this.capture.supersede();
    if (this.seekTimer) this.clock.clearTimeout(this.seekTimer);
    this.seekTimer = null;
    return this.serial(async () => {
      let changed = false;
      try {
        for (const timestamp of selection) {
          if (this.completed.has(timestamp)) continue;
          const frame = await this.seekFrame(timestamp);
          if (this.completed.has(frame.timestampMs)) {
            this.completed.add(timestamp);
            this.progress = { ...this.progress, done: this.progress.done + 1 };
            this.notify();
            continue;
          }
          const blob = await this.capture.captureFullResolution();
          this.assertCurrent();
          const upload = await this.upload(
            new File([blob], frameFilename(frame.timestampMs, blob.type), { type: blob.type }),
            {
              lineage: {
                sourceAssetRef: this.options.assetRef,
                timestampMs: Math.min(this.durationMs!, frame.timestampMs),
              },
              signal: this.signal,
            },
          );
          this.assertCurrent();
          this.completed.add(timestamp);
          this.completed.add(frame.timestampMs);
          this.results = [...this.results, { ...upload, timestampMs: frame.timestampMs }];
          this.progress = { ...this.progress, done: this.progress.done + 1 };
          this.notify();
          changed = true;
        }
        return this.results;
      } catch (error) {
        if (error instanceof ApiRequestError && error.error === 'invalid_frame_lineage')
          throw new FrameSessionError('unavailable');
        throw error;
      } finally {
        this.extracting = false;
        if (changed && !this.signal.aborted) invalidate();
        this.notify();
      }
    });
  }
  private onVisibility = () => {
    if (document.visibilityState === 'visible' && (this.video.error || this.video.readyState < 2)) {
      this.stale = true;
      this.capture.supersede();
    }
  };
  private onNativeError = () => {
    if (this.signal.aborted || this.operationActive) return;
    void this.serial(() => this.seekFrame(this.frame?.timestampMs ?? 0)).catch((error) => {
      if (!this.signal.aborted) this.options.onFailure?.(error);
    });
  };
  private teardownVideo() {
    this.video.removeEventListener('error', this.onNativeError);
    this.capture.dispose();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
  }
  dispose() {
    if (this.signal.aborted) return;
    this.generation++;
    this.abort.abort();
    if (this.seekTimer) this.clock.clearTimeout(this.seekTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.teardownVideo();
    this.urls.forEach(releaseFramePreview);
    this.urls.clear();
    this.listeners.clear();
  }
}
