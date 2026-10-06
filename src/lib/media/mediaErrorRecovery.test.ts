import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recoverFromMediaError } from './mediaErrorRecovery';
import { parseProtectedContentUrl, probeProtectedContent } from './protectedContent';
import { recoverContentAccess } from './contentAccessRecovery';
vi.mock('./protectedContent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./protectedContent')>()),
  probeProtectedContent: vi.fn(),
}));
vi.mock('./contentAccessRecovery', () => ({ recoverContentAccess: vi.fn() }));
const target = parseProtectedContentUrl('/v1/content/uploads/source')!;
const error = (code: number) => ({ code }) as MediaError;
beforeEach(() => vi.clearAllMocks());
describe('native media recovery', () => {
  it('recovers a proven 401 once', async () => {
    vi.mocked(probeProtectedContent).mockResolvedValue(new Response(null, { status: 401 }));
    vi.mocked(recoverContentAccess).mockResolvedValue({ ok: true, via: 'remint' });
    expect(
      await recoverFromMediaError(target, error(4), { signal: new AbortController().signal }),
    ).toEqual({ retry: true });
    expect(recoverContentAccess).toHaveBeenCalledOnce();
  });
  it.each([
    [200, 'unsupported'],
    [206, 'unsupported'],
    [404, 'not-found'],
    [403, 'forbidden'],
    [502, 'network'],
  ])('classifies probe %s without recovery', async (status, failure) => {
    vi.mocked(probeProtectedContent).mockResolvedValue(
      new Response(null, { status: Number(status) }),
    );
    expect(
      await recoverFromMediaError(target, error(2), { signal: new AbortController().signal }),
    ).toEqual({ retry: false, failure });
    expect(recoverContentAccess).not.toHaveBeenCalled();
  });
  it('classifies decode failure without a probe', async () => {
    expect(
      await recoverFromMediaError(target, error(3), { signal: new AbortController().signal }),
    ).toEqual({ retry: false, failure: 'unsupported' });
    expect(probeProtectedContent).not.toHaveBeenCalled();
  });
  it.each([
    [error(1), 'aborted'],
    [null, 'network'],
  ] as const)('classifies media error %s without probing', async (mediaError, failure) => {
    expect(
      await recoverFromMediaError(target, mediaError, { signal: new AbortController().signal }),
    ).toEqual({ retry: false, failure });
    expect(probeProtectedContent).not.toHaveBeenCalled();
  });
  it('honours cancellation before probing', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await recoverFromMediaError(target, error(4), { signal: controller.signal })).toEqual({
      retry: false,
      failure: 'aborted',
    });
    expect(probeProtectedContent).not.toHaveBeenCalled();
  });
});

it('ignores a late probe response after abort', async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(probeProtectedContent).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const controller = new AbortController();
  const recovery = recoverFromMediaError(target, error(4), { signal: controller.signal });
  controller.abort();
  resolve(new Response(null, { status: 401 }));
  expect(await recovery).toEqual({ retry: false, failure: 'aborted' });
  expect(recoverContentAccess).not.toHaveBeenCalled();
});
