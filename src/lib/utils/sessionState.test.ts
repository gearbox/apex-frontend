import { describe, expect, it } from 'vitest';
import {
  canStartSession,
  deriveCardState,
  isGenerateEnabled,
  isProvisioningStatus,
  isTerminalStatus,
  type ProvisioningMode,
  type RuntimeState,
} from './sessionState';

function runtime(state: RuntimeState) {
  return {
    state,
    session_id: state === 'none' ? null : 'sess_001',
    deployment_id: state === 'none' ? null : 'deploy_001',
    operation_id: ['provisioning', 'suspended', 'removing', 'stopping'].includes(state)
      ? 'op_001'
      : null,
  };
}

const onDemand = {
  provisioningMode: 'on_demand' as ProvisioningMode,
  available: true,
  isEnabled: true,
  isAuthenticated: true,
  runtime: runtime('none'),
};

describe('session lifecycle helpers', () => {
  it('keeps raw session lifecycle helpers explicitly session-specific', () => {
    expect(isProvisioningStatus('pending')).toBe(true);
    expect(isProvisioningStatus('resuming')).toBe(true);
    expect(isProvisioningStatus('active')).toBe(false);
    expect(isTerminalStatus('stopped')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
  });
});

describe('provider runtime card state', () => {
  it('evaluates disabled and unavailable before all runtime actions', () => {
    expect(deriveCardState({ ...onDemand, isEnabled: false })).toBe('DISABLED');
    expect(deriveCardState({ ...onDemand, available: false })).toBe('UNAVAILABLE');
  });

  it('makes available always-on models ready', () => {
    expect(
      deriveCardState({
        ...onDemand,
        provisioningMode: 'always_on',
        runtime: null,
        isAuthenticated: false,
      }),
    ).toBe('READY');
  });

  it('requires sign-in before interpreting an on-demand runtime', () => {
    expect(deriveCardState({ ...onDemand, isAuthenticated: false })).toBe('SIGN_IN_REQUIRED');
  });

  it('does not treat runtime null as authenticated none', () => {
    expect(deriveCardState({ ...onDemand, runtime: null })).toBe('RUNTIME_UNKNOWN');
    expect(deriveCardState({ ...onDemand, runtime: undefined })).toBe('RUNTIME_UNKNOWN');
  });

  it.each([
    ['none', 'NEEDS_SESSION'],
    ['provisioning', 'PROVISIONING'],
    ['active', 'READY'],
    ['suspended', 'RESTARTING'],
    ['removing', 'REMOVING'],
    ['paused', 'PAUSED'],
    ['stale', 'STALE'],
    ['stopping', 'STOPPING'],
  ] as const)('maps runtime %s explicitly', (state, expected) => {
    expect(deriveCardState({ ...onDemand, runtime: runtime(state) })).toBe(expected);
  });

  it('only enables Generate for a ready runtime', () => {
    expect(isGenerateEnabled('READY')).toBe(true);
    for (const state of [
      'DISABLED',
      'UNAVAILABLE',
      'SIGN_IN_REQUIRED',
      'RUNTIME_UNKNOWN',
      'NEEDS_SESSION',
      'PROVISIONING',
      'RESTARTING',
      'REMOVING',
      'PAUSED',
      'STALE',
      'STOPPING',
    ] as const) {
      expect(isGenerateEnabled(state)).toBe(false);
    }
  });

  it('offers Start only when the server says the on-demand slot is none', () => {
    expect(canStartSession(deriveCardState({ ...onDemand, runtime: runtime('none') }))).toBe(true);
    for (const state of [
      'provisioning',
      'active',
      'suspended',
      'removing',
      'paused',
      'stale',
      'stopping',
    ] as const) {
      expect(canStartSession(deriveCardState({ ...onDemand, runtime: runtime(state) }))).toBe(
        false,
      );
    }
  });
});
