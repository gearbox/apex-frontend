import { SESSION_KEYS } from '$lib/utils/constants';
import { safeReturnPath } from '$lib/utils/returnPath';

export interface OAuthPendingSignup {
  ticket: string;
  returnTo: string | null;
  savedAt: number;
}

const MAX_AGE_MS = 15 * 60 * 1000;

function isPendingSignup(value: unknown): value is OAuthPendingSignup {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.ticket === 'string' &&
    record.ticket.length > 0 &&
    (typeof record.returnTo === 'string' || record.returnTo === null) &&
    typeof record.savedAt === 'number' &&
    Number.isFinite(record.savedAt)
  );
}

/** sessionStorage is optional: private-mode failures should behave as a missing handoff. */
export function save(pending: OAuthPendingSignup): void {
  try {
    sessionStorage.setItem(SESSION_KEYS.OAUTH_PENDING_SIGNUP, JSON.stringify(pending));
  } catch {
    // The callback can still show its safe terminal error rather than leaking the ticket.
  }
}

export function load(): OAuthPendingSignup | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.OAUTH_PENDING_SIGNUP);
    if (!raw) return null;
    const pending: unknown = JSON.parse(raw);
    if (!isPendingSignup(pending) || Date.now() - pending.savedAt > MAX_AGE_MS) {
      clear();
      return null;
    }
    return { ...pending, returnTo: safeReturnPath(pending.returnTo) };
  } catch {
    clear();
    return null;
  }
}

export function clear(): void {
  try {
    sessionStorage.removeItem(SESSION_KEYS.OAUTH_PENDING_SIGNUP);
  } catch {
    // Storage is best effort and does not change the server's ticket authority.
  }
}
