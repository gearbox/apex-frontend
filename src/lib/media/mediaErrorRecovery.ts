import { recoverContentAccess } from './contentAccessRecovery';
import { probeProtectedContent, type ProtectedContentUrl } from './protectedContent';

export type MediaFailure =
  | 'authentication'
  | 'forbidden'
  | 'not-found'
  | 'network'
  | 'unsupported'
  | 'canvas-not-origin-clean'
  | 'timeout'
  | 'aborted'
  | 'unavailable';
export type MediaRecoveryResult = { retry: true } | { retry: false; failure: MediaFailure };

/** Classifies native errors using a cookie-only, one-byte probe. No protected diagnostics escape. */
export async function recoverFromMediaError(
  target: ProtectedContentUrl,
  error: MediaError | null,
  opts: { signal: AbortSignal; onUnauthorized?: () => boolean | void },
): Promise<MediaRecoveryResult> {
  const fail = (failure: MediaFailure): MediaRecoveryResult => ({ retry: false, failure });
  if (opts.signal.aborted) return fail('aborted');
  if (error?.code !== 2 && error?.code !== 4) return fail('unsupported');
  try {
    const probe = await probeProtectedContent(target, { signal: opts.signal });
    // Never retain even the one-byte probe body.
    void probe.body?.cancel().catch(() => undefined);
    if (opts.signal.aborted) return fail('aborted');
    if (probe.status === 401) {
      if (opts.onUnauthorized?.() === false) return fail('aborted');
      const result = await recoverContentAccess({ signal: opts.signal });
      if (opts.signal.aborted || (!result.ok && result.reason === 'aborted'))
        return fail('aborted');
      return result.ok ? { retry: true } : fail('authentication');
    }
    if (probe.status === 403) return fail('forbidden');
    if (probe.status === 404) return fail('not-found');
    return fail(probe.ok ? 'unsupported' : 'network');
  } catch {
    return fail(opts.signal.aborted ? 'aborted' : 'network');
  }
}
