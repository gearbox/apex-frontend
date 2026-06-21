import { describe, it, expect } from 'vitest';
import {
  sessionStateFromStatus,
  isProvisioningStatus,
  isTerminalStatus,
  deriveCardState,
  isGenerateEnabled,
  type SessionStatus,
  type SessionState,
  type ProvisioningMode,
} from './sessionState';

const ALL_STATUSES: SessionStatus[] = [
  'pending',
  'provisioning',
  'active',
  'stale',
  'paused',
  'resuming',
  'stopping',
  'stopped',
  'failed',
];

describe('sessionStateFromStatus()', () => {
  it('maps active → active', () => {
    expect(sessionStateFromStatus('active')).toBe('active');
  });

  it('maps pending → provisioning', () => {
    expect(sessionStateFromStatus('pending')).toBe('provisioning');
  });

  it('maps provisioning → provisioning', () => {
    expect(sessionStateFromStatus('provisioning')).toBe('provisioning');
  });

  it('maps resuming → provisioning', () => {
    expect(sessionStateFromStatus('resuming')).toBe('provisioning');
  });

  it('maps paused → paused', () => {
    expect(sessionStateFromStatus('paused')).toBe('paused');
  });

  it('maps stale → stale', () => {
    expect(sessionStateFromStatus('stale')).toBe('stale');
  });

  it('maps stopping → stopping', () => {
    expect(sessionStateFromStatus('stopping')).toBe('stopping');
  });

  it('maps stopped → none', () => {
    expect(sessionStateFromStatus('stopped')).toBe('none');
  });

  it('maps failed → none', () => {
    expect(sessionStateFromStatus('failed')).toBe('none');
  });

  it('covers all 9 GpuSessionStatus values', () => {
    expect(ALL_STATUSES).toHaveLength(9);
    for (const s of ALL_STATUSES) {
      const state = sessionStateFromStatus(s);
      expect(['none', 'provisioning', 'active', 'paused', 'stale', 'stopping']).toContain(state);
    }
  });
});

describe('isProvisioningStatus()', () => {
  it('returns true for pending, provisioning, resuming', () => {
    expect(isProvisioningStatus('pending')).toBe(true);
    expect(isProvisioningStatus('provisioning')).toBe(true);
    expect(isProvisioningStatus('resuming')).toBe(true);
  });

  it('returns false for non-provisioning statuses', () => {
    expect(isProvisioningStatus('active')).toBe(false);
    expect(isProvisioningStatus('stopped')).toBe(false);
    expect(isProvisioningStatus('failed')).toBe(false);
    expect(isProvisioningStatus('stale')).toBe(false);
    expect(isProvisioningStatus('paused')).toBe(false);
    expect(isProvisioningStatus('stopping')).toBe(false);
    expect(isProvisioningStatus('unknown')).toBe(false);
  });
});

describe('isTerminalStatus()', () => {
  it('returns true for stopped and failed', () => {
    expect(isTerminalStatus('stopped')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
  });

  it('returns false for non-terminal statuses', () => {
    expect(isTerminalStatus('active')).toBe(false);
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('provisioning')).toBe(false);
    expect(isTerminalStatus('resuming')).toBe(false);
    expect(isTerminalStatus('paused')).toBe(false);
    expect(isTerminalStatus('stale')).toBe(false);
    expect(isTerminalStatus('stopping')).toBe(false);
    expect(isTerminalStatus('unknown')).toBe(false);
  });
});

describe('deriveCardState()', () => {
  const always_on = {
    provisioningMode: 'always_on' as ProvisioningMode,
    available: true,
    sessionState: 'none' as SessionState | null | undefined,
    isAuthenticated: true,
  };
  const on_demand = {
    provisioningMode: 'on_demand' as ProvisioningMode,
    available: true,
    sessionState: 'none' as SessionState | null | undefined,
    isAuthenticated: true,
  };

  // Row 1: always_on → READY regardless of everything else
  it('always_on → READY', () => {
    expect(deriveCardState(always_on)).toBe('READY');
  });

  it('always_on wins even when unavailable and unauthenticated', () => {
    expect(deriveCardState({ ...always_on, available: false, isAuthenticated: false })).toBe(
      'READY',
    );
  });

  // Row 2: on_demand + unauthenticated → SIGN_IN_REQUIRED
  it('on_demand + unauthenticated → SIGN_IN_REQUIRED', () => {
    expect(deriveCardState({ ...on_demand, isAuthenticated: false })).toBe('SIGN_IN_REQUIRED');
  });

  // Row 3: on_demand + unavailable → UNAVAILABLE (beats session_state)
  it('on_demand + unavailable → UNAVAILABLE', () => {
    expect(deriveCardState({ ...on_demand, available: false })).toBe('UNAVAILABLE');
  });

  it('on_demand + unavailable + session_state active still → UNAVAILABLE', () => {
    expect(deriveCardState({ ...on_demand, available: false, sessionState: 'active' })).toBe(
      'UNAVAILABLE',
    );
  });

  it('on_demand + unavailable + session_state stale still → UNAVAILABLE', () => {
    expect(deriveCardState({ ...on_demand, available: false, sessionState: 'stale' })).toBe(
      'UNAVAILABLE',
    );
  });

  // Row 4: session_state none/null/undefined → NEEDS_SESSION
  it('on_demand + available + session_state none → NEEDS_SESSION', () => {
    expect(deriveCardState({ ...on_demand, sessionState: 'none' })).toBe('NEEDS_SESSION');
  });

  it('on_demand + available + session_state null → NEEDS_SESSION', () => {
    expect(deriveCardState({ ...on_demand, sessionState: null })).toBe('NEEDS_SESSION');
  });

  it('on_demand + available + session_state undefined → NEEDS_SESSION', () => {
    expect(deriveCardState({ ...on_demand, sessionState: undefined })).toBe('NEEDS_SESSION');
  });

  // Row 5: provisioning → PROVISIONING
  it('on_demand + available + session_state provisioning → PROVISIONING', () => {
    expect(deriveCardState({ ...on_demand, sessionState: 'provisioning' })).toBe('PROVISIONING');
  });

  // Row 6: active → READY
  it('on_demand + available + session_state active → READY', () => {
    expect(deriveCardState({ ...on_demand, sessionState: 'active' })).toBe('READY');
  });

  // Row 7: stale → STALE
  it('on_demand + available + session_state stale → STALE', () => {
    expect(deriveCardState({ ...on_demand, sessionState: 'stale' })).toBe('STALE');
  });

  // Row 8: stopping → STOPPING
  it('on_demand + available + session_state stopping → STOPPING', () => {
    expect(deriveCardState({ ...on_demand, sessionState: 'stopping' })).toBe('STOPPING');
  });

  // Row 9: paused → PAUSED_HIDDEN
  it('on_demand + available + session_state paused → PAUSED_HIDDEN', () => {
    expect(deriveCardState({ ...on_demand, sessionState: 'paused' })).toBe('PAUSED_HIDDEN');
  });

  // Unknown session_state falls back to NEEDS_SESSION
  it('unknown session_state → NEEDS_SESSION', () => {
    expect(
      deriveCardState({ ...on_demand, sessionState: 'unknown_future_state' as unknown as SessionState }),
    ).toBe('NEEDS_SESSION');
  });
});

describe('isGenerateEnabled()', () => {
  it('returns true only for READY', () => {
    expect(isGenerateEnabled('READY')).toBe(true);
  });

  it('returns false for all non-READY states', () => {
    const nonReady = [
      'SIGN_IN_REQUIRED',
      'UNAVAILABLE',
      'NEEDS_SESSION',
      'PROVISIONING',
      'STALE',
      'STOPPING',
      'PAUSED_HIDDEN',
    ] as const;
    for (const state of nonReady) {
      expect(isGenerateEnabled(state)).toBe(false);
    }
  });
});
