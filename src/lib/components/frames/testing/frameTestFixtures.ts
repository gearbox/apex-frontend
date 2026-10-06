import { vi } from 'vitest';
import type { components } from '$lib/api/types';
import type { UploadResponse } from '$lib/api/upload';

export const ASSET_REF = 'upload:c0000000-0000-4000-8000-000000000001';
export const videoMedia: components['schemas']['MediaObject'] = {
  asset_ref: ASSET_REF,
  media_type: 'video',
  variants: [],
  original: {
    url: '/v1/content/uploads/c0000000-0000-4000-8000-000000000001',
    width: 3840,
    height: 2160,
    content_type: 'video/mp4',
    size_bytes: 100_000_000,
    duration_ms: 3000,
  },
};
export const uploaded: UploadResponse = {
  id: 'c0000000-0000-4000-8000-000000000002',
  filename: 'frame.png',
  created_at: '2026-10-06T00:00:00Z',
  expires_at: '2026-11-06T00:00:00Z',
  media: {
    media_type: 'image',
    variants: [],
    original: {
      url: '/v1/content/uploads/c0000000-0000-4000-8000-000000000002',
      width: 3840,
      height: 2160,
      content_type: 'image/png',
      size_bytes: 10,
    },
  },
};

export function installMediaMocks({
  width = 3840,
  height = 2160,
  duration = 3,
  actualOffsetMs = 0,
  tainted = false,
}: {
  width?: number;
  height?: number;
  duration?: number;
  actualOffsetMs?: number;
  tainted?: boolean;
} = {}) {
  if (typeof requestAnimationFrame === 'function')
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      queueMicrotask(() => callback(0));
      return 1;
    });
  const drawImage = vi.fn();
  const getImageData = vi.fn(() => {
    if (tainted) throw new DOMException('private detail', 'SecurityError');
    return new ImageData(1, 1);
  });
  // jsdom need not implement ImageData; tests only check whether the read throws.
  getImageData.mockImplementation(() => {
    if (tainted) throw new DOMException('private detail', 'SecurityError');
    return {} as ImageData;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
    getImageData,
  } as unknown as CanvasRenderingContext2D);
  const encodes: {
    width: number;
    height: number;
    canvas: HTMLCanvasElement;
    type: string | undefined;
  }[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    type,
  ) {
    encodes.push({ width: this.width, height: this.height, canvas: this, type });
    callback(new Blob(['frame'], { type: type ?? 'image/png' }));
  });
  let sequence = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: URL.createObjectURL ?? (() => ''),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: URL.revokeObjectURL ?? (() => undefined),
  });
  const createURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation(() => `blob:frame-${++sequence}`);
  const revokeURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(duration);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(height);
  const times = new WeakMap<HTMLMediaElement, number>();
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return times.get(this) ?? 0;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set').mockImplementation(function (
    this: HTMLMediaElement,
    value,
  ) {
    times.set(this, value);
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
  });
  const createVideo = () => {
    const video = document.createElement('video');
    let callbackSequence = 0;
    const cancelled = new Set<number>();
    video.requestVideoFrameCallback = (callback) => {
      const id = ++callbackSequence;
      queueMicrotask(() => {
        if (!cancelled.has(id))
          callback(0, {
            mediaTime: video.currentTime + actualOffsetMs / 1000,
          } as VideoFrameCallbackMetadata);
      });
      return id;
    };
    video.cancelVideoFrameCallback = (id) => {
      cancelled.add(id);
    };
    return video;
  };
  return { drawImage, getImageData, encodes, createURL, revokeURL, createVideo };
}
