import { describe, expect, it } from 'vitest';
import { eligibleAttachModels } from './deploymentEligibility';

describe('eligibleAttachModels', () => {
  it('offers only enabled, available, unoccupied on-demand models in the known provider family', () => {
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

    expect(eligibleAttachModels(providers, deployments)).toEqual([
      { model: 'aisha-image-lite', name: 'Aisha Lite' },
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
