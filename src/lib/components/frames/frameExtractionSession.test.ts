import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameExtractionSession, automaticTimestamps } from './frameExtractionSession';
import { ASSET_REF, videoMedia, uploaded, installMediaMocks } from './testing/frameTestFixtures';
import { ApiRequestError } from '$lib/api/errors';

const sessions: FrameExtractionSession[] = [];
afterEach(() => {
  sessions.forEach((s) => s.dispose());
  sessions.length = 0;
  vi.restoreAllMocks();
});
function fixture(
  options: Parameters<typeof installMediaMocks>[0] = {},
  overrides: Partial<ConstructorParameters<typeof FrameExtractionSession>[0]> = {},
) {
  const mocks = installMediaMocks(options);
  const video = mocks.createVideo();
  const upload = vi.fn().mockResolvedValue(uploaded);
  const recover = vi.fn().mockResolvedValue({ retry: false, failure: 'unsupported' });
  const session = new FrameExtractionSession({
    assetRef: ASSET_REF,
    media: videoMedia,
    createVideo: () => video,
    upload,
    recover,
    ...overrides,
  });
  sessions.push(session);
  return { session, video, upload, recover, ...mocks };
}

describe('FrameExtractionSession', () => {
  it('sets credentialed CORS before src and produces six ascending local previews using one decoder', async () => {
    const f = fixture();
    const src = vi.spyOn(f.video, 'src', 'set');
    src.mockImplementation(function (this: HTMLVideoElement, value) {
      expect(this.crossOrigin).toBe('use-credentials');
      this.setAttribute('src', value);
    });
    const frames = await f.session.load();
    expect(frames.map((f) => f.timestampMs)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    expect(f.video.src).toContain('/v1/content/uploads/');
    expect(f.upload).not.toHaveBeenCalled();
    f.session.dispose();
    expect(f.revokeURL).toHaveBeenCalledTimes(6);
    expect(f.session.canvas.width).toBe(0);
    expect(f.session.fullCanvas.width).toBe(0);
    expect(f.video.hasAttribute('src')).toBe(false);
    expect(f.session.signal.aborted).toBe(true);
  });
  it.each([null, 'bad-url'])(
    'does not request unavailable or invalid media (%s)',
    async (value) => {
      const media = structuredClone(videoMedia);
      if (value === null) media.original.duration_ms = null;
      else media.original.url = value;
      const f = fixture({}, { media });
      const src = vi.spyOn(f.video, 'src', 'set');
      await expect(f.session.load()).rejects.toMatchObject({
        failure: value === null ? 'unavailable' : 'not-found',
      });
      expect(src).not.toHaveBeenCalled();
    },
  );
  it('rejects media whose canonical asset reference differs before requesting it', async () => {
    const media = structuredClone(videoMedia);
    media.asset_ref = 'upload:c0000000-0000-4000-8000-000000000099';
    const f = fixture({}, { media });
    const src = vi.spyOn(f.video, 'src', 'set');
    const load = vi.spyOn(f.video, 'load');
    await expect(f.session.load()).rejects.toMatchObject({ failure: 'unavailable' });
    expect(src).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  });
  it('rejects an audio-only decoder without auth recovery', async () => {
    const f = fixture({ width: 0 });
    await expect(f.session.load()).rejects.toMatchObject({ failure: 'unsupported' });
    expect(f.recover).not.toHaveBeenCalled();
  });
  it('rejects a tainted pixel read without auth recovery', async () => {
    const f = fixture({ tainted: true });
    await expect(f.session.load()).rejects.toMatchObject({ failure: 'canvas-not-origin-clean' });
    expect(f.recover).not.toHaveBeenCalled();
  });
  it.each([
    [2, 1999],
    [4, 2999],
    [Infinity, 2999],
    [NaN, 2999],
  ])('bounds the decoded timeline (%s)', async (duration, max) => {
    const f = fixture({ duration });
    await f.session.load();
    expect(f.session.maxTimestamp).toBe(max);
  });
  it('dedupes very short clips and actual presented times', async () => {
    expect(automaticTimestamps(1)).toEqual([0, 1]);
    const f = fixture({ actualOffsetMs: 30 });
    const previews = await f.session.load();
    expect(previews[0]).toMatchObject({ requestedTimestampMs: 0, timestampMs: 30 });
    await f.session.extract([30, 30], vi.fn());
    expect(f.upload).toHaveBeenCalledOnce();
    expect(f.upload.mock.calls[0][1].lineage.timestampMs).toBe(60);
  });
  it('captures full decoded dimensions sequentially and reuses one full canvas', async () => {
    const f = fixture();
    await f.session.load();
    let resolve!: (value: typeof uploaded) => void;
    f.upload.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const invalidate = vi.fn();
    const batch = f.session.extract([0, 500], invalidate);
    await vi.waitFor(() => expect(f.upload).toHaveBeenCalledTimes(1));
    expect(f.upload).toHaveBeenCalledTimes(1);
    resolve(uploaded);
    await batch;
    expect(f.upload).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledOnce();
    const full = f.encodes.filter((e) => e.type === 'image/png');
    expect(full.map((e) => [e.width, e.height])).toEqual([
      [3840, 2160],
      [3840, 2160],
    ]);
    expect(full[0].canvas).toBe(full[1].canvas);
    expect(full[0].canvas.width).toBe(0);
    expect(f.upload.mock.calls[0][1]).toMatchObject({
      lineage: { sourceAssetRef: ASSET_REF, timestampMs: 0 },
    });
  });
  it('retains completed uploads and retries only the remainder after a batch failure', async () => {
    const f = fixture();
    await f.session.load();
    f.upload.mockResolvedValueOnce(uploaded).mockRejectedValueOnce(new Error('offline'));
    const invalidate = vi.fn();
    await expect(f.session.extract([0, 500, 1000], invalidate)).rejects.toThrow('offline');
    expect(f.session.results).toHaveLength(1);
    await f.session.extract([0, 500, 1000], invalidate);
    expect(f.upload.mock.calls.map((call) => call[1].lineage.timestampMs)).toEqual([
      0, 500, 500, 1000,
    ]);
  });
  it('stops the batch on invalid lineage and keeps previous results', async () => {
    const f = fixture();
    await f.session.load();
    f.upload.mockResolvedValueOnce(uploaded).mockRejectedValueOnce(
      new ApiRequestError({
        error: 'invalid_frame_lineage',
        message: 'source missing',
        status_code: 400,
      }),
    );
    await expect(f.session.extract([0, 500, 1000], vi.fn())).rejects.toMatchObject({
      failure: 'unavailable',
    });
    expect(f.upload).toHaveBeenCalledTimes(2);
    expect(f.session.results).toHaveLength(1);
  });
  it('aborts close during upload and ignores its late result', async () => {
    const f = fixture();
    await f.session.load();
    let resolve!: (value: typeof uploaded) => void;
    f.upload.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const invalidate = vi.fn();
    const batch = f.session.extract([0, 500], invalidate);
    const assertion = expect(batch).rejects.toMatchObject({ failure: 'aborted' });
    await vi.waitFor(() => expect(f.upload).toHaveBeenCalledOnce());
    f.session.dispose();
    resolve(uploaded);
    await assertion;
    expect(f.session.results).toHaveLength(0);
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('reloads a stale decoder on visibility resume and never repeats completed uploads', async () => {
    const f = fixture();
    await f.session.load();
    expect(f.getImageData).toHaveBeenCalledOnce();
    await f.session.extract([0], vi.fn());
    vi.spyOn(f.video, 'readyState', 'get').mockReturnValue(0);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.spyOn(f.video, 'readyState', 'get').mockReturnValue(2);
    await f.session.extract([0, 500], vi.fn());
    expect(f.upload.mock.calls.map((call) => call[1].lineage.timestampMs)).toEqual([0, 500]);
    expect(f.getImageData).toHaveBeenCalledTimes(2);
  });
  it('never sends lineage above server duration', async () => {
    const f = fixture({ duration: 4, actualOffsetMs: 100 });
    await f.session.load();
    await f.session.extract([4000], vi.fn());
    expect(f.upload.mock.calls[0][1].lineage.timestampMs).toBe(3000);
  });
});

describe('session operation boundaries', () => {
  it('ignores superseded scrubs while keeping only the final request', async () => {
    const f = fixture();
    await f.session.load();
    const onError = vi.fn();
    f.session.scrub(1000, onError);
    await new Promise((resolve) => setTimeout(resolve, 80));
    f.session.scrub(2000, onError);
    await vi.waitFor(() => expect(f.session.frame?.timestampMs).toBe(2000));
    expect(onError).not.toHaveBeenCalled();
    expect(f.encodes).toHaveLength(6);
  });
  it('enforces the selection limit before upload', async () => {
    const f = fixture();
    await f.session.load();
    await expect(
      f.session.extract(
        Array.from({ length: 51 }, (_, i) => i),
        vi.fn(),
      ),
    ).rejects.toThrow('invalid-selection');
    expect(f.upload).not.toHaveBeenCalled();
  });
  it('cancels delayed metadata on dispose', async () => {
    const f = fixture();
    vi.spyOn(f.video, 'readyState', 'get').mockReturnValue(0);
    const load = f.session.load();
    const assertion = expect(load).rejects.toMatchObject({ failure: 'aborted' });
    await Promise.resolve();
    f.session.dispose();
    await assertion;
    expect(f.session.previews).toHaveLength(0);
  });
  it('uses the injected timeout for missing metadata', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      vi.spyOn(f.video, 'readyState', 'get').mockReturnValue(0);
      const assertion = expect(f.session.load()).rejects.toMatchObject({ failure: 'timeout' });
      await vi.advanceTimersByTimeAsync(8000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
  it('routes native errors through bounded recovery and retries the same URL once', async () => {
    const f = fixture();
    let nativeError: MediaError | null = { code: 4 } as MediaError;
    Object.defineProperty(f.video, 'error', { configurable: true, get: () => nativeError });
    const load = vi.spyOn(f.video, 'load').mockImplementation(() => {
      if (load.mock.calls.length > 1) nativeError = null;
    });
    f.recover.mockResolvedValue({ retry: true });
    await f.session.load();
    expect(f.recover).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(2);
    expect(f.video.src).toContain(videoMedia.original.url);
  });
  it('recovers separate media-error episodes after a successful frame seek', async () => {
    const f = fixture();
    let nativeError: MediaError | null = null;
    Object.defineProperty(f.video, 'error', { configurable: true, get: () => nativeError });
    await f.session.load();
    const reload = vi.spyOn(f.video, 'load').mockImplementation(() => {
      nativeError = null;
    });
    reload.mockClear();
    f.recover.mockResolvedValue({ retry: true });

    nativeError = { code: 4 } as MediaError;
    await f.session.extract([0], vi.fn());
    expect(f.recover).toHaveBeenCalledOnce();
    for (const timestamp of [200, 450, 900]) {
      f.session.scrub(timestamp, vi.fn());
      await vi.waitFor(() => expect(f.session.frame?.timestampMs).toBe(timestamp));
    }

    nativeError = { code: 2 } as MediaError;
    await f.session.extract([2000], vi.fn());
    expect(f.recover).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(f.upload.mock.calls.map((call) => call[1].lineage.timestampMs)).toEqual([0, 2000]);
  });
  it('allows only one retry when the same media-error episode keeps failing', async () => {
    const f = fixture();
    let nativeError: MediaError | null = null;
    Object.defineProperty(f.video, 'error', { configurable: true, get: () => nativeError });
    await f.session.load();
    const reload = vi.spyOn(f.video, 'load').mockImplementation(() => undefined);
    reload.mockClear();
    f.recover.mockResolvedValue({ retry: true });
    nativeError = { code: 4 } as MediaError;

    await expect(f.session.extract([0], vi.fn())).rejects.toMatchObject({
      failure: 'authentication',
    });
    expect(f.recover).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
  });
  it('classifies a decode error after recovery as unsupported', async () => {
    const f = fixture();
    let nativeError: MediaError | null = null;
    Object.defineProperty(f.video, 'error', { configurable: true, get: () => nativeError });
    await f.session.load();
    vi.spyOn(f.video, 'load').mockImplementation(() => {
      nativeError = null;
    });
    f.recover.mockImplementation(async (_target, error) =>
      error?.code === 3 ? { retry: false, failure: 'unsupported' } : { retry: true },
    );

    nativeError = { code: 4 } as MediaError;
    await f.session.extract([0], vi.fn());
    nativeError = { code: 3 } as MediaError;
    await expect(f.session.extract([500], vi.fn())).rejects.toMatchObject({
      failure: 'unsupported',
    });
    expect(f.recover).toHaveBeenCalledTimes(2);
  });
  it('checks origin cleanliness once per decoder load instead of on every seek', async () => {
    const f = fixture();
    await f.session.load();
    expect(f.getImageData).toHaveBeenCalledOnce();
    for (const timestamp of [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000]) {
      f.session.scrub(timestamp, vi.fn());
      await vi.waitFor(() => expect(f.session.frame?.timestampMs).toBe(timestamp));
    }
    expect(f.getImageData).toHaveBeenCalledOnce();
  });
  it('checks origin cleanliness again after a visibility-triggered decoder reload', async () => {
    const f = fixture();
    await f.session.load();
    expect(f.getImageData).toHaveBeenCalledOnce();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const readyState = vi.spyOn(f.video, 'readyState', 'get').mockReturnValue(0);
    document.dispatchEvent(new Event('visibilitychange'));
    readyState.mockReturnValue(2);
    f.session.scrub(500, vi.fn());
    await vi.waitFor(() => expect(f.session.frame?.timestampMs).toBe(500));
    expect(f.getImageData).toHaveBeenCalledTimes(2);
  });
});

describe('foreground operation boundaries', () => {
  it('waits for foreground and continues remaining selections without duplicate uploads', async () => {
    const f = fixture();
    await f.session.load();
    await f.session.extract([0], vi.fn());
    let visibility: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const batch = f.session.extract([0, 500], vi.fn());
    await Promise.resolve();
    await Promise.resolve();
    expect(f.upload).toHaveBeenCalledOnce();
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await batch;
    expect(f.upload.mock.calls.map((call) => call[1].lineage.timestampMs)).toEqual([0, 500]);
  });
});
