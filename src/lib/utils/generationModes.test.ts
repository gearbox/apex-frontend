import { describe, expect, it } from 'vitest';
import {
  createSupportedModes,
  enabledModes,
  findModelInfo,
  resolveModelForMode,
} from './generationModes';
import { makeGrokImageModelInfo, generationModes } from '../../mocks/factories/providers';
import type { components } from '$lib/api/types';

type ProvidersResponse = components['schemas']['ProvidersResponse'];

describe('provider-discovered modes', () => {
  it('uses every advertised generation mode without a frontend create-mode list', () => {
    const info = makeGrokImageModelInfo({
      generation_modes: generationModes(['t2i', 'future-edit']),
    });
    expect(createSupportedModes(info)).toEqual(['t2i', 'future-edit']);
  });

  it('makes v2v actionable like any other advertised mode', () => {
    const info = makeGrokImageModelInfo({
      generation_modes: generationModes(['t2v', 'v2v', 'flf2v']),
    });
    expect(createSupportedModes(info)).toEqual(['t2v', 'v2v', 'flf2v']);
  });

  it('keeps disabled models visible to discovery but excludes them from actionable modes', () => {
    const providers: ProvidersResponse = {
      providers: [
        {
          provider: 'grok',
          name: 'Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            makeGrokImageModelInfo({
              is_enabled: false,
              generation_modes: generationModes(['t2i']),
            }),
            makeGrokImageModelInfo({
              model_key: 'grok-2-image-1212',
              generation_modes: generationModes(['future-edit']),
            }),
          ],
        },
      ],
      user_context: null,
    };
    expect(enabledModes(providers)).toEqual(new Set(['future-edit']));
    expect(resolveModelForMode(providers, 'future-edit')).toBe('grok-2-image-1212');
  });

  it('prefers the selected capable model, then the selected provider, before other providers', () => {
    const providers: ProvidersResponse = {
      providers: [
        {
          provider: 'grok',
          name: 'Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            makeGrokImageModelInfo({ generation_modes: generationModes(['t2i']) }),
            makeGrokImageModelInfo({
              model_key: 'grok-imagine-video',
              generation_modes: generationModes(['i2v']),
            }),
          ],
        },
        {
          provider: 'other',
          name: 'Other',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            makeGrokImageModelInfo({
              model_key: 'aisha-video',
              generation_modes: generationModes(['i2v']),
            }),
          ],
        },
      ],
      user_context: null,
    };
    expect(resolveModelForMode(providers, 'i2v', 'grok-imagine-image')).toBe('grok-imagine-video');
    expect(resolveModelForMode(providers, 'i2v', 'aisha-video')).toBe('aisha-video');
  });

  it('finds models across providers and never resolves disabled-only capabilities', () => {
    const model = makeGrokImageModelInfo({
      is_enabled: false,
      generation_modes: generationModes(['i2v']),
    });
    const providers: ProvidersResponse = {
      providers: [
        {
          provider: 'grok',
          name: 'Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [model],
        },
      ],
      user_context: null,
    };
    expect(findModelInfo(providers, 'grok-imagine-image')).toEqual(model);
    expect(findModelInfo(providers, 'missing')).toBeNull();
    expect(resolveModelForMode(providers, 'i2v')).toBeNull();
  });
});
