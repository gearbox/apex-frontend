import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentCookieRemintResult, SilentRefreshResult } from '$lib/api/auth';
import { setAuthFailureReason, __resetAuthFailureReasonForTesting } from '$lib/stores/auth';
import { invalidateAuthOperations } from '$lib/stores/authLifecycle';

const { silentRefreshMock, remintContentCookieMock } = vi.hoisted(() => ({
  silentRefreshMock: vi.fn<() => Promise<SilentRefreshResult>>(),
  remintContentCookieMock: vi.fn<() => Promise<ContentCookieRemintResult>>(),
}));

vi.mock('$lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/auth')>()),
  silentRefresh: silentRefreshMock,
  remintContentCookie: remintContentCookieMock,
}));

import { recoverContentAccess } from './contentAccessRecovery';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const remintOk: ContentCookieRemintResult = {
  kind: 'ok',
  expiresAt: new Date('2026-12-31T00:00:00Z'),
};

beforeEach(() => {
  __resetAuthFailureReasonForTesting();
  remintContentCookieMock.mockReset().mockResolvedValue(remintOk);
  silentRefreshMock.mockReset().mockResolvedValue({ ok: true });
});

describe('recoverContentAccess', () => {
  it('rung 1: a successful re-mint recovers without a full refresh', async () => {
    await expect(recoverContentAccess()).resolves.toEqual({ ok: true, via: 'remint' });
    expect(remintContentCookieMock).toHaveBeenCalledOnce();
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });

  it('rung 2: an explicit re-mint authorization failure falls back to one silent refresh', async () => {
    remintContentCookieMock.mockResolvedValue({ kind: 'unauthorized' });

    await expect(recoverContentAccess()).resolves.toEqual({ ok: true, via: 'refresh' });
    expect(remintContentCookieMock).toHaveBeenCalledOnce();
    expect(silentRefreshMock).toHaveBeenCalledOnce();
  });

  it('reports unauthorized when the fallback refresh is definitively rejected', async () => {
    remintContentCookieMock.mockResolvedValue({ kind: 'unauthorized' });
    silentRefreshMock.mockResolvedValue({ ok: false, reason: 'invalid_token' });

    await expect(recoverContentAccess()).resolves.toEqual({ ok: false, reason: 'unauthorized' });
    expect(silentRefreshMock).toHaveBeenCalledOnce();
  });

  it('reports revoked when the fallback refresh detects token reuse', async () => {
    remintContentCookieMock.mockResolvedValue({ kind: 'unauthorized' });
    silentRefreshMock.mockImplementation(async () => {
      setAuthFailureReason('token_reuse_detected');
      return { ok: false, reason: 'token_reuse_detected' };
    });

    await expect(recoverContentAccess()).resolves.toEqual({ ok: false, reason: 'revoked' });
  });

  it.each([
    [{ kind: 'transient' }, 'transient'],
    [{ kind: 'rate_limited', retryAfterMs: 30_000 }, 'rate_limited'],
    [{ kind: 'stale' }, 'stale'],
    [{ kind: 'aborted' }, 'aborted'],
  ] as const)('never escalates a %j re-mint into a silent refresh', async (remint, reason) => {
    remintContentCookieMock.mockResolvedValue(remint);

    await expect(recoverContentAccess()).resolves.toEqual({ ok: false, reason });
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });

  it('treats a thrown re-mint as transient and does not refresh', async () => {
    remintContentCookieMock.mockRejectedValue(new Error('boom'));

    await expect(recoverContentAccess()).resolves.toEqual({ ok: false, reason: 'transient' });
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });

  it('treats a network refresh failure (or a thrown refresh) as transient', async () => {
    remintContentCookieMock.mockResolvedValue({ kind: 'unauthorized' });
    silentRefreshMock.mockResolvedValueOnce({ ok: false, reason: 'network' });
    await expect(recoverContentAccess()).resolves.toEqual({ ok: false, reason: 'transient' });

    silentRefreshMock.mockRejectedValueOnce(new Error('offline'));
    await expect(recoverContentAccess()).resolves.toEqual({ ok: false, reason: 'transient' });
  });

  it.each(['token_reuse_detected', 'account_inactive'] as const)(
    'a session already known to be revoked (%s) generates no retry traffic',
    async (reason) => {
      setAuthFailureReason(reason);

      await expect(recoverContentAccess()).resolves.toEqual({ ok: false, reason: 'revoked' });
      expect(remintContentCookieMock).not.toHaveBeenCalled();
      expect(silentRefreshMock).not.toHaveBeenCalled();
    },
  );

  it('an ordinary invalid_token marker keeps the normal ladder', async () => {
    setAuthFailureReason('invalid_token');

    await expect(recoverContentAccess()).resolves.toEqual({ ok: true, via: 'remint' });
  });

  it('a session replaced during the re-mint reports stale and cannot refresh the new session', async () => {
    const remint = deferred<ContentCookieRemintResult>();
    remintContentCookieMock.mockReturnValue(remint.promise);

    const pending = recoverContentAccess();
    invalidateAuthOperations();
    remint.resolve({ kind: 'unauthorized' });

    await expect(pending).resolves.toEqual({ ok: false, reason: 'stale' });
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });

  it('a successful re-mint that lands after a session change is still stale', async () => {
    const remint = deferred<ContentCookieRemintResult>();
    remintContentCookieMock.mockReturnValue(remint.promise);

    const pending = recoverContentAccess();
    invalidateAuthOperations();
    remint.resolve(remintOk);

    await expect(pending).resolves.toEqual({ ok: false, reason: 'stale' });
  });

  it('a session replaced during the refresh reports stale rather than ok', async () => {
    remintContentCookieMock.mockResolvedValue({ kind: 'unauthorized' });
    const refresh = deferred<SilentRefreshResult>();
    silentRefreshMock.mockReturnValue(refresh.promise);

    const pending = recoverContentAccess();
    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledOnce());
    invalidateAuthOperations();
    refresh.resolve({ ok: true });

    await expect(pending).resolves.toEqual({ ok: false, reason: 'stale' });
  });

  it('an already-aborted caller issues no requests', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(recoverContentAccess({ signal: controller.signal })).resolves.toEqual({
      ok: false,
      reason: 'aborted',
    });
    expect(remintContentCookieMock).not.toHaveBeenCalled();
  });

  it('a caller aborted during the re-mint does not escalate to a refresh', async () => {
    const controller = new AbortController();
    const remint = deferred<ContentCookieRemintResult>();
    remintContentCookieMock.mockReturnValue(remint.promise);

    const pending = recoverContentAccess({ signal: controller.signal });
    controller.abort();
    remint.resolve({ kind: 'unauthorized' });

    await expect(pending).resolves.toEqual({ ok: false, reason: 'aborted' });
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });

  it('is strictly one-shot: each call performs at most one re-mint and one refresh', async () => {
    remintContentCookieMock.mockResolvedValue({ kind: 'unauthorized' });
    silentRefreshMock.mockResolvedValue({ ok: false, reason: 'invalid_token' });

    await recoverContentAccess();

    expect(remintContentCookieMock).toHaveBeenCalledTimes(1);
    expect(silentRefreshMock).toHaveBeenCalledTimes(1);
  });
});
