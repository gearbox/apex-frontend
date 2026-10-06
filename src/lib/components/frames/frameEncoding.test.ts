import { describe, expect, it, vi } from 'vitest';
import { encodeFrame, MAX_FRAME_UPLOAD_BYTES, frameFilename } from './frameEncoding';
function canvas(results: { type: string; size: number }[]) {
  const toBlob = vi.fn((callback: BlobCallback) => {
    const result = results.shift()!;
    callback({ ...result } as Blob);
  });
  return { toBlob } as unknown as HTMLCanvasElement;
}
describe('full frame encoding', () => {
  it('prefers PNG within the inclusive budget', async () => {
    expect(
      await encodeFrame(canvas([{ type: 'image/png', size: MAX_FRAME_UPLOAD_BYTES }])),
    ).toMatchObject({ type: 'image/png' });
  });
  it('falls back to WebP when PNG is too large', async () => {
    expect(
      await encodeFrame(
        canvas([
          { type: 'image/png', size: MAX_FRAME_UPLOAD_BYTES + 1 },
          { type: 'image/webp', size: 10 },
        ]),
      ),
    ).toMatchObject({ type: 'image/webp' });
  });
  it('rejects Safari PNG substitution and uses JPEG', async () => {
    expect(
      await encodeFrame(
        canvas([
          { type: 'image/png', size: MAX_FRAME_UPLOAD_BYTES + 1 },
          { type: 'image/png', size: 10 },
          { type: 'image/jpeg', size: 10 },
        ]),
      ),
    ).toMatchObject({ type: 'image/jpeg' });
  });
  it('fails explicitly when all formats exceed budget', async () => {
    await expect(
      encodeFrame(
        canvas(
          ['image/png', 'image/webp', 'image/jpeg'].map((type) => ({
            type,
            size: MAX_FRAME_UPLOAD_BYTES + 1,
          })),
        ),
      ),
    ).rejects.toMatchObject({ code: 'frame-too-large' });
  });
  it('formats upload filenames with actual milliseconds', () => {
    expect(frameFilename(61234, 'image/jpeg')).toBe('frame-01m01s234.jpg');
  });
});
