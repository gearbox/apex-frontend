import type { components } from '$lib/api/types';
import { toMediaSrc } from './toMediaSrc';

type MediaObject = components['schemas']['MediaObject'];
type ImageVariant = components['schemas']['ImageVariant'];

export interface ImgAttrs {
  src: string;
  srcset?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

export function imgAttrs(m: MediaObject, sizes?: string): ImgAttrs {
  const src = toMediaSrc(m.original.url);
  const srcsetParts = m.variants.map((v) => `${toMediaSrc(v.url)} ${v.width}w`);
  const srcset = srcsetParts.length > 0 ? srcsetParts.join(', ') : undefined;
  return {
    src,
    ...(srcset !== undefined && { srcset }),
    ...(sizes !== undefined && { sizes }),
    ...(m.original.width != null && { width: m.original.width }),
    ...(m.original.height != null && { height: m.original.height }),
  };
}

/** Smallest variant whose width >= target, else largest variant, else undefined. */
export function pickVariant(m: MediaObject, target: number): ImageVariant | undefined {
  if (m.variants.length === 0) return undefined;
  const fit = m.variants.find((v) => v.width >= target);
  return fit ?? m.variants[m.variants.length - 1];
}

/** Single src for non-srcset contexts (background, poster). Falls back to original. */
export function mediaFallbackSrc(m: MediaObject, target?: number): string {
  if (target !== undefined) {
    const v = pickVariant(m, target);
    if (v) return toMediaSrc(v.url);
  } else if (m.variants.length > 0) {
    return toMediaSrc(m.variants[0].url);
  }
  return toMediaSrc(m.original.url);
}

/** Poster src for <video>: prefer ~512 variant, else largest, else undefined. */
export function posterSrc(m: MediaObject): string | undefined {
  if (m.variants.length === 0) return undefined;
  const v = pickVariant(m, 512);
  return v ? toMediaSrc(v.url) : undefined;
}

/** Frame-precision timestamp (mm:ss.mmm) for millisecond-based callers, e.g. FrameScrubber. */
export function formatTimestampFromMs(timestampMs: number): string {
  const value = Math.max(0, Math.round(timestampMs));
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.floor((value % 60_000) / 1_000);
  const milliseconds = value % 1_000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    milliseconds,
  ).padStart(3, '0')}`;
}

/** Playback timestamp (mm:ss) for second-based callers, e.g. HTMLVideoElement.currentTime. */
export function formatTimestampFromSeconds(timestampSeconds: number): string {
  const value = Math.max(0, Math.round(timestampSeconds));
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
