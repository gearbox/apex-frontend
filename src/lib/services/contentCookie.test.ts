import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/svelte-query';
import {
  start,
  stop,
  msUntilNextRemint,
  isDueForRemint,
  MIN_REMINT_INTERVAL_MS,
  REMINT_LIFETIME_FRACTION,
} from './contentCookie';
import { setContentCookieExpiresAt, getContentCookieExpiresAt } from '$lib/stores/auth';

const { remintContentCookieMock, silentRefreshMock } = vi.hoisted(() => ({
  remintContentCookieMock: vi.fn<() => Promise<Date | null>>(),
  silentRefreshMock: vi.fn<() => Promise<{ ok: true } | { ok: false; reason: string }>>(),
}));

vi.mock('$lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/auth')>()),
  remintContentCookie: remintContentCookieMock,
  silentRefresh: silentRefreshMock,
}));

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  remintContentCookieMock.mockReset();
  silentRefreshMock.mockReset();
  setContentCookieExpiresAt(null);
  setVisibility('visible');
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('msUntilNextRemint', () => {
  it('schedules at 75% of the remaining lifetime', () => {
    const now = Date.now();
    const expiresAt = new Date(now + 10_000_000);

    expect(msUntilNextRemint(expiresAt, now)).toBe(10_000_000 * REMINT_LIFETIME_FRACTION);
  });

  it('floors at MIN_REMINT_INTERVAL_MS so a near-expiry value cannot busy-loop', () => {
    const now = Date.now();
    const expiresAt = new Date(now + 60_000); // 1 minute out — 75% of that is well under the floor

    expect(msUntilNextRemint(expiresAt, now)).toBe(MIN_REMINT_INTERVAL_MS);
  });
});

describe('isDueForRemint', () => {
  const now = Date.now();

  it('is due when there is no stored expiry', () => {
    expect(isDueForRemint(null, now)).toBe(true);
  });

  it('is due when the expiry has already passed', () => {
    expect(isDueForRemint(new Date(now - 1000), now)).toBe(true);
  });

  it('is due when within the floor window', () => {
    expect(isDueForRemint(new Date(now + MIN_REMINT_INTERVAL_MS - 1), now)).toBe(true);
  });

  it('is not due when comfortably in the future', () => {
    expect(isDueForRemint(new Date(now + MIN_REMINT_INTERVAL_MS + 60_000), now)).toBe(false);
  });
});

describe('start()', () => {
  it('does nothing while there is nothing scheduled and stop() is safe to call', () => {
    expect(() => stop()).not.toThrow();
  });

  it('reschedules from the fresh expiry after a successful re-mint cycle', async () => {
    const firstExpiry = new Date(Date.now() + 20_000_000);
    setContentCookieExpiresAt(firstExpiry);
    const secondExpiry = new Date(Date.now() + 40_000_000);
    remintContentCookieMock.mockResolvedValueOnce(secondExpiry);

    start();
    await vi.advanceTimersByTimeAsync(msUntilNextRemint(firstExpiry));

    expect(remintContentCookieMock).toHaveBeenCalledTimes(1);

    // Advancing to just before the *second* schedule must not fire yet...
    remintContentCookieMock.mockResolvedValueOnce(new Date(Date.now() + 999_999_999));
    await vi.advanceTimersByTimeAsync(msUntilNextRemint(secondExpiry) - 1000);
    expect(remintContentCookieMock).toHaveBeenCalledTimes(1);

    // ...and fires once the rescheduled interval elapses.
    await vi.advanceTimersByTimeAsync(1000);
    expect(remintContentCookieMock).toHaveBeenCalledTimes(2);
  });

  it('escalates to silentRefresh when the re-mint fails, and stops scheduling if that fails too', async () => {
    setContentCookieExpiresAt(new Date(Date.now() + 20_000_000));
    remintContentCookieMock.mockResolvedValue(null);
    silentRefreshMock.mockResolvedValue({ ok: false, reason: 'invalid_token' });

    start();
    await vi.advanceTimersByTimeAsync(msUntilNextRemint(new Date(Date.now() + 20_000_000)));

    expect(remintContentCookieMock).toHaveBeenCalledTimes(1);
    expect(silentRefreshMock).toHaveBeenCalledTimes(1);

    // No further cycles are scheduled after a definitive failure.
    remintContentCookieMock.mockClear();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(remintContentCookieMock).not.toHaveBeenCalled();
  });

  it('escalates to silentRefresh and reschedules from its refreshed expiry on success', async () => {
    setContentCookieExpiresAt(new Date(Date.now() + 20_000_000));
    remintContentCookieMock.mockResolvedValue(null);
    silentRefreshMock.mockImplementation(async () => {
      setContentCookieExpiresAt(new Date(Date.now() + 86_400_000));
      return { ok: true };
    });

    start();
    await vi.advanceTimersByTimeAsync(msUntilNextRemint(new Date(Date.now() + 20_000_000)));

    expect(silentRefreshMock).toHaveBeenCalledTimes(1);

    // The mock set a fresh 24h-out expiry as of "now" at that point — reschedule is computed
    // from *that* value, not from the floor.
    const refreshedExpiry = getContentCookieExpiresAt()!;
    remintContentCookieMock.mockClear();
    await vi.advanceTimersByTimeAsync(msUntilNextRemint(refreshedExpiry));
    expect(remintContentCookieMock).toHaveBeenCalledTimes(1);
  });

  it('immediately runs a cycle on start() when the stored expiry is already due', async () => {
    setContentCookieExpiresAt(new Date(Date.now() - 1000));
    remintContentCookieMock.mockResolvedValue(new Date(Date.now() + 86_400_000));

    start();
    await vi.advanceTimersByTimeAsync(0);

    expect(remintContentCookieMock).toHaveBeenCalledTimes(1);
  });

  it('visibility -> visible re-mints only when the stored expiry is past/near (resume check, C4)', async () => {
    setContentCookieExpiresAt(new Date(Date.now() + 86_400_000));
    remintContentCookieMock.mockResolvedValue(new Date(Date.now() + 86_400_000));
    start();
    remintContentCookieMock.mockClear();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(remintContentCookieMock).not.toHaveBeenCalled();

    setContentCookieExpiresAt(new Date(Date.now() + 60_000)); // now within the floor
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(remintContentCookieMock).toHaveBeenCalledTimes(1);
  });

  it('pageshow re-mints only when the stored expiry is past/near', async () => {
    setContentCookieExpiresAt(new Date(Date.now() + 86_400_000));
    remintContentCookieMock.mockResolvedValue(new Date(Date.now() + 86_400_000));
    start();
    remintContentCookieMock.mockClear();

    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);
    expect(remintContentCookieMock).not.toHaveBeenCalled();

    setContentCookieExpiresAt(new Date(Date.now() - 1));
    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);
    expect(remintContentCookieMock).toHaveBeenCalledTimes(1);
  });

  it('the resume check pauses and restores TanStack Query online state around the network call (C5)', async () => {
    setContentCookieExpiresAt(new Date(Date.now() - 1));
    let onlineDuringCall: boolean | undefined;
    remintContentCookieMock.mockImplementation(async () => {
      onlineDuringCall = onlineManager.isOnline();
      return new Date(Date.now() + 86_400_000);
    });
    start();
    remintContentCookieMock.mockClear();
    setContentCookieExpiresAt(new Date(Date.now() - 1));

    const wasOnlineBefore = onlineManager.isOnline();
    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);

    expect(onlineDuringCall).toBe(false);
    expect(onlineManager.isOnline()).toBe(wasOnlineBefore);
  });

  it('stop() clears the timer and every listener — nothing fires afterward', async () => {
    setContentCookieExpiresAt(new Date(Date.now() + 20_000_000));
    remintContentCookieMock.mockResolvedValue(new Date(Date.now() + 86_400_000));
    start();

    stop();
    remintContentCookieMock.mockClear();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);

    expect(remintContentCookieMock).not.toHaveBeenCalled();
  });

  it('nothing runs while unauthenticated (start() never called)', async () => {
    setContentCookieExpiresAt(new Date(Date.now() - 1));
    remintContentCookieMock.mockResolvedValue(new Date());

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));

    expect(remintContentCookieMock).not.toHaveBeenCalled();
  });
});
