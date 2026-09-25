import {
  remintContentCookie,
  silentRefresh,
  type ContentCookieRemintResult,
  type SilentRefreshResult,
} from '$lib/api/auth';
import { getAuthFailureReason } from '$lib/stores/auth';
import { getAuthEpoch, isAuthEpochCurrent } from '$lib/stores/authLifecycle';

export type ContentAccessRecovery =
  | { ok: true; via: 'remint' | 'refresh' }
  | {
      ok: false;
      reason: 'revoked' | 'unauthorized' | 'rate_limited' | 'transient' | 'stale' | 'aborted';
    };

export interface RecoverContentAccessOptions {
  /** The consumer's own lifetime. Recovery flights are shared, so this only detaches the caller. */
  signal?: AbortSignal;
}

/** A known-revoked session cannot be recovered by either rung; retrying it is pure noise. */
function isKnownRevoked(): boolean {
  const reason = getAuthFailureReason();
  return reason === 'token_reuse_detected' || reason === 'account_inactive';
}

/**
 * One-shot reaction to an actual protected-content failure (e.g. a 401 or a native media error).
 * The caller retries the exact same stable URL at most once when this resolves `ok`.
 *
 * 1. Re-mint the content cookie with the current access token — the common, cheap case.
 * 2. Only when the re-mint is explicitly `unauthorized`, run the broader silentRefresh().
 *
 * Transient, rate-limited, stale, and aborted outcomes never escalate to a refresh. Work that
 * outlives its auth epoch (logout, account switch) reports `stale` so it cannot affect the new
 * session. Scheduling/backoff stays in contentCookieService; this primitive never loops.
 */
export async function recoverContentAccess(
  options: RecoverContentAccessOptions = {},
): Promise<ContentAccessRecovery> {
  const { signal } = options;
  const epoch = getAuthEpoch();
  const interrupted = (): ContentAccessRecovery | null => {
    if (signal?.aborted) return { ok: false, reason: 'aborted' };
    if (!isAuthEpochCurrent(epoch)) return { ok: false, reason: 'stale' };
    return null;
  };

  const early = interrupted();
  if (early) return early;
  if (isKnownRevoked()) return { ok: false, reason: 'revoked' };

  const remint = await remintContentCookie().catch((): ContentCookieRemintResult => ({
    kind: 'transient',
  }));
  const afterRemint = interrupted();
  if (afterRemint) return afterRemint;

  if (remint.kind === 'ok') return { ok: true, via: 'remint' };
  if (remint.kind !== 'unauthorized') return { ok: false, reason: remint.kind };

  const refreshed = await silentRefresh().catch((): SilentRefreshResult => ({
    ok: false,
    reason: 'network',
  }));
  const afterRefresh = interrupted();
  if (afterRefresh) return afterRefresh;

  if (refreshed.ok) return { ok: true, via: 'refresh' };
  if (refreshed.reason === 'network') return { ok: false, reason: 'transient' };
  if (refreshed.reason === 'stale' || refreshed.reason === 'aborted') {
    return { ok: false, reason: refreshed.reason };
  }
  return { ok: false, reason: isKnownRevoked() ? 'revoked' : 'unauthorized' };
}
