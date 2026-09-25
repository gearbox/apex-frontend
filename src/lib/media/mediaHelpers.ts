import type { components } from '$lib/api/types';
import { toMediaSrc } from './toMediaSrc';

type MediaObject = components['schemas']['MediaObject'];
type ImageVariant = components['schemas']['ImageVariant'];

export interface ImgAttrs {
  /** Null when the original is not a valid protected-content URL — render unavailable instead. */
  src: string | null;
  srcset?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

export function imgAttrs(m: MediaObject, sizes?: string): ImgAttrs {
  const src = toMediaSrc(m.original.url);
  const srcsetParts = m.variants.flatMap((v) => {
    const variantSrc = toMediaSrc(v.url);
    return variantSrc ? [`${variantSrc} ${v.width}w`] : [];
  });
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
function pickVariantFrom<T extends Pick<ImageVariant, 'width'>>(
  variants: readonly T[],
  target: number,
): T | undefined {
  let fit: T | undefined;
  let largest: T | undefined;

  for (const variant of variants) {
    if (!largest || variant.width > largest.width) largest = variant;
    if (variant.width >= target && (!fit || variant.width < fit.width)) fit = variant;
  }

  return fit ?? largest;
}

/** Smallest variant whose width >= target, else largest variant, else undefined. */
export function pickVariant(m: MediaObject, target: number): ImageVariant | undefined {
  return pickVariantFrom(m.variants, target);
}

/** Single src for non-srcset contexts (background, poster). Falls back to original. */
export function mediaFallbackSrc(m: MediaObject, target?: number): string | null {
  const validVariants = m.variants.flatMap((variant) => {
    const src = toMediaSrc(variant.url);
    return src ? [{ ...variant, src }] : [];
  });
  const preferred =
    target === undefined ? validVariants[0] : pickVariantFrom(validVariants, target);

  if (preferred) return preferred.src;
  return toMediaSrc(m.original.url);
}

/** Poster src for <video>: prefer ~512 variant, else largest, else undefined. */
export function posterSrc(m: MediaObject): string | undefined {
  const validPosters = m.variants.flatMap((variant) => {
    const src = toMediaSrc(variant.url);
    return src ? [{ ...variant, src }] : [];
  });
  // A video's original is video bytes, never an image poster. Do not fall back to it here.
  return pickVariantFrom(validPosters, 512)?.src;
}

/** Frame-precision timestamp (mm:ss.mmm) for millisecond-based callers, e.g. FrameScrubber. */
export function formatTimestampFromMs(timestampMs: number): string {
  // Number.isFinite (not Number.isNaN) — a video's `duration` is `Infinity` for
  // live/streaming sources, which Number.isNaN alone would let through to Math.round.
  if (!Number.isFinite(timestampMs)) return '--:--.---';
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
  if (!Number.isFinite(timestampSeconds)) return '--:--';
  const value = Math.max(0, Math.round(timestampSeconds));
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
