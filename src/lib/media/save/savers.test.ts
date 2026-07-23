import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shareFile, downloadBlob } from './savers';
import { SaveActivationError } from './types';

function stubShare(impl: () => Promise<void>) {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: vi.fn(impl),
  });
}

function testFile(): File {
  return new File([new Blob(['x'])], 'a.jpg', { type: 'image/jpeg' });
}

describe('downloadBlob', () => {
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('appends the anchor to the DOM, clicks it, then removes it', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    const outcome = downloadBlob(new Blob(['x']), 'file.jpg');

    expect(outcome).toBe('downloaded');
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe('file.jpg');
    expect(anchor.href).toBe('blob:mock-url');
    expect(document.body.contains(anchor)).toBe(false);
  });

  it('defers revokeObjectURL — it is not called synchronously', () => {
    downloadBlob(new Blob(['x']), 'file.jpg');

    expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('shareFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "shared" on success', async () => {
    stubShare(() => Promise.resolve());
    await expect(shareFile(testFile())).resolves.toBe('shared');
  });

  it('returns "cancelled" on AbortError', async () => {
    stubShare(() => Promise.reject(new DOMException('aborted', 'AbortError')));
    await expect(shareFile(testFile())).resolves.toBe('cancelled');
  });

  it('throws SaveActivationError on NotAllowedError', async () => {
    stubShare(() => Promise.reject(new DOMException('not allowed', 'NotAllowedError')));
    await expect(shareFile(testFile())).rejects.toBeInstanceOf(SaveActivationError);
  });

  it('throws SaveFailedError("unsupported") on any other error', async () => {
    stubShare(() => Promise.reject(new Error('boom')));
    await expect(shareFile(testFile())).rejects.toMatchObject({ reason: 'unsupported' });
  });
});
