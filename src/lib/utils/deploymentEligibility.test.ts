import { describe, expect, it } from 'vitest';
import {
  canRemoveDeployment,
  eligibleAttachModels,
  requiresForceToRemoveDeployment,
} from './deploymentEligibility';

describe('eligibleAttachModels', () => {
  it('offers only enabled, available, unoccupied on-demand models, regardless of provider family', () => {
    const providers = [
      {
        provider: 'aisha',
        available: true,
        provisioning_mode: 'on_demand',
        models: [
          {
            model_key: 'aisha-image',
            name: 'Aisha Image',
            is_enabled: true,
            runtime: { state: 'active' },
          },
          {
            model_key: 'aisha-image-lite',
            name: 'Aisha Lite',
            is_enabled: true,
            runtime: { state: 'none' },
          },
          {
            model_key: 'aisha-video',
            name: 'Aisha Video',
            is_enabled: false,
            runtime: { state: 'none' },
          },
        ],
      },
      {
        provider: 'grok',
        available: true,
        provisioning_mode: 'on_demand',
        models: [
          {
            model_key: 'grok-imagine-image',
            name: 'Grok',
            is_enabled: true,
            runtime: { state: 'none' },
          },
        ],
      },
    ] as never;
    const deployments = [{ model_type: 'aisha-image', status: 'active' }] as never;

    // A model from a different provider than the session's existing deployment is still
    // eligible — the backend attach service enforces no same-provider-family rule.
    expect(eligibleAttachModels(providers, deployments)).toEqual([
      { model: 'aisha-image-lite', name: 'Aisha Lite' },
      { model: 'grok-imagine-image', name: 'Grok' },
    ]);
  });

  it('does not treat failed or removed deployments as model occupancy', () => {
    const providers = [
      {
        provider: 'aisha',
        available: true,
        provisioning_mode: 'on_demand',
        models: [
          {
            model_key: 'aisha-image-lite',
            name: 'Aisha Lite',
            is_enabled: true,
            runtime: { state: 'none' },
          },
        ],
      },
    ] as never;
    const deployments = [{ model_type: 'aisha-image-lite', status: 'failed' }] as never;
    expect(eligibleAttachModels(providers, deployments)).toEqual([
      { model: 'aisha-image-lite', name: 'Aisha Lite' },
    ]);
  });
});

describe('deployment removal eligibility', () => {
  const deployment = (id: string, status: string) => ({ id, status }) as never;

  it.each([
    ['active', 'active', true],
    ['active', 'deploying', false],
    ['active', 'removing', false],
    ['active', 'removed', false],
    ['active', 'failed', false],
    ['paused', 'active', false],
    ['stale', 'active', false],
    ['resuming', 'active', false],
    ['stopping', 'active', false],
  ] as const)(
    'allows Remove for session %s and deployment %s: %s',
    (session, deployment, expected) => {
      expect(canRemoveDeployment(session, deployment)).toBe(expected);
    },
  );

  it.each([
    ['active sibling', [deployment('target', 'active'), deployment('other', 'active')], false],
    ['deploying sibling', [deployment('target', 'active'), deployment('other', 'deploying')], true],
    ['removing sibling', [deployment('target', 'active'), deployment('other', 'removing')], true],
    ['failed sibling', [deployment('target', 'active'), deployment('other', 'failed')], true],
    ['removed sibling', [deployment('target', 'active'), deployment('other', 'removed')], true],
    ['single active target', [deployment('target', 'active')], true],
  ])('requires force with %s', (_description, deployments, expected) => {
    expect(requiresForceToRemoveDeployment(deployments, 'target')).toBe(expected);
  });

  it('does not decide force for a missing or non-active target', () => {
    expect(requiresForceToRemoveDeployment([deployment('other', 'active')], 'missing')).toBe(false);
    expect(
      requiresForceToRemoveDeployment(
        [deployment('target', 'deploying'), deployment('other', 'active')],
        'target',
      ),
    ).toBe(false);
  });
});
