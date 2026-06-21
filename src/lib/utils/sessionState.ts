export type SessionState = 'none' | 'provisioning' | 'active' | 'paused' | 'stale' | 'stopping';

export type SessionStatus =
  | 'pending'
  | 'provisioning'
  | 'active'
  | 'stale'
  | 'paused'
  | 'resuming'
  | 'stopping'
  | 'stopped'
  | 'failed';

export function sessionStateFromStatus(s: SessionStatus): SessionState {
  switch (s) {
    case 'active':
      return 'active';
    case 'pending':
    case 'provisioning':
    case 'resuming':
      return 'provisioning';
    case 'paused':
      return 'paused';
    case 'stale':
      return 'stale';
    case 'stopping':
      return 'stopping';
    case 'stopped':
    case 'failed':
      return 'none';
  }
}

const PROVISIONING: readonly SessionStatus[] = ['pending', 'provisioning', 'resuming'];
const TERMINAL: readonly SessionStatus[] = ['stopped', 'failed'];

export function isProvisioningStatus(s: string): boolean {
  return (PROVISIONING as readonly string[]).includes(s);
}

export function isTerminalStatus(s: string): boolean {
  return (TERMINAL as readonly string[]).includes(s);
}

// ── Card state machine ──────────────────────────────────────────────────────

export type CardState =
  | 'READY'
  | 'SIGN_IN_REQUIRED'
  | 'UNAVAILABLE'
  | 'NEEDS_SESSION'
  | 'PROVISIONING'
  | 'STALE'
  | 'STOPPING'
  | 'PAUSED_HIDDEN';

export interface DeriveCardStateArgs {
  provisioningMode: string;
  available: boolean;
  sessionState: string | null | undefined;
  isAuthenticated: boolean;
}

export function deriveCardState(a: DeriveCardStateArgs): CardState {
  if (a.provisioningMode === 'always_on') return 'READY';
  if (!a.isAuthenticated) return 'SIGN_IN_REQUIRED';
  if (!a.available) return 'UNAVAILABLE';
  switch (a.sessionState) {
    case 'active':
      return 'READY';
    case 'provisioning':
      return 'PROVISIONING';
    case 'stale':
      return 'STALE';
    case 'stopping':
      return 'STOPPING';
    case 'paused':
      return 'PAUSED_HIDDEN';
    case 'none':
    case null:
    case undefined:
    default:
      return 'NEEDS_SESSION';
  }
}

export function isGenerateEnabled(state: CardState): boolean {
  return state === 'READY';
}
