export const MAX_FRAME_UPLOAD_BYTES = 20 * 1024 * 1024;

export class FrameEncodingError extends Error {
  constructor(
    readonly code: 'frame-too-large' | 'canvas-not-origin-clean' | 'canvas-encode-failed',
  ) {
    super(code);
  }
}

/** Full-size frames never silently downscale. Safari may substitute PNG for WebP. */
export async function encodeFrame(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const type of ['image/png', 'image/webp', 'image/jpeg']) {
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob(resolve, type, 0.95);
      } catch (error) {
        reject(
          new FrameEncodingError(
            error instanceof DOMException && error.name === 'SecurityError'
              ? 'canvas-not-origin-clean'
              : 'canvas-encode-failed',
          ),
        );
      }
    });
    if (blob?.type === type && blob.size <= MAX_FRAME_UPLOAD_BYTES) return blob;
  }
  throw new FrameEncodingError('frame-too-large');
}

export function frameFilename(timestampMs: number, type: string): string {
  const ms = Math.max(0, Math.round(timestampMs));
  const pad = (value: number, digits = 2) => String(value).padStart(digits, '0');
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return `frame-${pad(Math.floor(ms / 60000))}m${pad(Math.floor(ms / 1000) % 60)}s${pad(ms % 1000, 3)}.${ext}`;
}
