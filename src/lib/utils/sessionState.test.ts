import { describe, it, expect } from 'vitest';
import {
  sessionStateFromStatus,
  isProvisioningStatus,
  isTerminalStatus,
  type SessionStatus,
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
