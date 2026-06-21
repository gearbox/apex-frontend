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
