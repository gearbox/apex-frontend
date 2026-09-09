import type { components } from '$lib/api/types';

export type RuntimeState = components['schemas']['RuntimeState'];
export type GpuSessionStatus = components['schemas']['GpuSessionStatus'];
export type ModelRuntime = components['schemas']['ModelRuntimeResponse'];

const PROVISIONING: readonly GpuSessionStatus[] = ['pending', 'provisioning', 'resuming'];
const TERMINAL: readonly GpuSessionStatus[] = ['stopped', 'failed'];

/** Session-only lifecycle helpers. They must not derive model-card readiness. */
export function isProvisioningStatus(status: string): boolean {
  return (PROVISIONING as readonly string[]).includes(status);
}

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL as readonly string[]).includes(status);
}

// ── Card state machine ──────────────────────────────────────────────────────

export type CardState =
  | 'DISABLED'
  | 'READY'
  | 'SIGN_IN_REQUIRED'
  | 'UNAVAILABLE'
  | 'RUNTIME_UNKNOWN'
  | 'NEEDS_SESSION'
  | 'PROVISIONING'
  | 'RESTARTING'
  | 'REMOVING'
  | 'STALE'
  | 'STOPPING'
  | 'PAUSED';

export type ProvisioningMode = 'always_on' | 'on_demand';

export function isProvisioningMode(value: string | null | undefined): value is ProvisioningMode {
  return value === 'always_on' || value === 'on_demand';
}

export interface DeriveCardStateArgs {
  provisioningMode: ProvisioningMode;
  available: boolean;
  isEnabled: boolean;
  runtime: ModelRuntime | null | undefined;
  isAuthenticated: boolean;
}

/** Model-card readiness comes only from the provider runtime projection. */
export function deriveCardState(args: DeriveCardStateArgs): CardState {
  if (!args.isEnabled) return 'DISABLED';
  if (!args.available) return 'UNAVAILABLE';
  if (args.provisioningMode === 'always_on') return 'READY';
  if (!args.isAuthenticated) return 'SIGN_IN_REQUIRED';
  if (!args.runtime) return 'RUNTIME_UNKNOWN';

  switch (args.runtime.state) {
    case 'none':
      return 'NEEDS_SESSION';
    case 'provisioning':
      return 'PROVISIONING';
    case 'active':
      return 'READY';
    case 'suspended':
      return 'RESTARTING';
    case 'removing':
      return 'REMOVING';
    case 'paused':
      return 'PAUSED';
    case 'stale':
      return 'STALE';
    case 'stopping':
      return 'STOPPING';
  }
}

export function isGenerateEnabled(state: CardState): boolean {
  return state === 'READY';
}

export function canStartSession(state: CardState): boolean {
  return state === 'NEEDS_SESSION';
}
