import { describe, expect, it } from 'vitest';
import {
  createSupportedModes,
  enabledModes,
  enabledRoles,
  findModelInfo,
  modeForRole,
  resolveModelForMode,
  resolveModelForRole,
  soleAdvertisedRole,
} from './generationModes';
import {
  makeAishaVideoModelInfo,
  makeGrokImageModelInfo,
  makeGrokVideoModelInfo,
  generationModes,
} from '../../mocks/factories/providers';
import type { components } from '$lib/api/types';

type ProvidersResponse = components['schemas']['ProvidersResponse'];

function singleProviderProviders(models: components['schemas']['ModelInfo'][]): ProvidersResponse {
  return {
    providers: [
      { provider: 'aisha', name: 'Aisha', available: true, provisioning_mode: 'on_demand', models },
    ],
    user_context: null,
  };
}

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

describe('enabledRoles', () => {
  it('collects named roles from enabled models only, ignoring disabled ones', () => {
    const providers = singleProviderProviders([
      makeAishaVideoModelInfo(),
      makeAishaVideoModelInfo({ model_key: 'aisha-video-disabled', is_enabled: false }),
    ]);
    expect(enabledRoles(providers)).toEqual(new Set(['first_frame', 'last_frame']));
  });

  it('is empty when only roleless (Grok-shaped) models are enabled', () => {
    const providers = singleProviderProviders([makeGrokVideoModelInfo()]);
    expect(enabledRoles(providers)).toEqual(new Set());
  });
});

describe('resolveModelForRole', () => {
  it('prefers the preferred model, then same provider, then any enabled provider', () => {
    const providers: ProvidersResponse = {
      providers: [
        {
          provider: 'aisha',
          name: 'Aisha',
          available: true,
          provisioning_mode: 'on_demand',
          models: [
            makeAishaVideoModelInfo({ model_key: 'aisha-video-a' }),
            makeAishaVideoModelInfo({ model_key: 'aisha-video-b' }),
          ],
        },
        {
          provider: 'other',
          name: 'Other',
          available: true,
          provisioning_mode: 'always_on',
          models: [makeAishaVideoModelInfo({ model_key: 'other-video' })],
        },
      ],
      user_context: null,
    };
    expect(resolveModelForRole(providers, 'first_frame', 'aisha-video-a')).toBe('aisha-video-a');
    expect(resolveModelForRole(providers, 'first_frame', 'grok-imagine-video')).toBe(
      'aisha-video-a',
    );
    expect(resolveModelForRole(providers, 'first_frame')).toBe('aisha-video-a');
  });

  it('never resolves a role a model does not actually advertise, even from an enabled model', () => {
    const providers = singleProviderProviders([makeGrokVideoModelInfo()]); // roles: null everywhere
    expect(resolveModelForRole(providers, 'first_frame')).toBeNull();
  });

  it('never resolves a role from a disabled model', () => {
    const providers = singleProviderProviders([makeAishaVideoModelInfo({ is_enabled: false })]);
    expect(resolveModelForRole(providers, 'first_frame')).toBeNull();
  });

  it('requires the media kind protocol-fixed for the role, not just the role name', () => {
    // A malformed contract advertising `last_frame` for a video-only mode
    // must never be treated as capable — the role/kind pairing is fixed.
    const providers = singleProviderProviders([
      makeAishaVideoModelInfo({
        generation_modes: generationModes(['t2v', 'v2v'], {
          v2v: { min: 1, max: 1, media_types: ['video'], roles: ['last_frame'] },
        }),
      }),
    ]);
    expect(resolveModelForRole(providers, 'last_frame')).toBeNull();
  });
});

describe('modeForRole', () => {
  it('picks the alphabetically-first advertised mode containing the role, deterministically', () => {
    expect(modeForRole(makeAishaVideoModelInfo(), 'first_frame')).toBe('flf2v');
    expect(modeForRole(makeAishaVideoModelInfo(), 'last_frame')).toBe('flf2v');
  });

  it('returns null when no mode advertises the role', () => {
    expect(modeForRole(makeGrokVideoModelInfo(), 'first_frame')).toBeNull();
  });
});

describe('soleAdvertisedRole', () => {
  it('returns the sole role for a single-role positional mode', () => {
    expect(soleAdvertisedRole(makeAishaVideoModelInfo(), 'i2v')).toBe('first_frame');
  });

  it('returns null for a roleless mode', () => {
    expect(soleAdvertisedRole(makeGrokVideoModelInfo(), 'i2v')).toBeNull();
  });

  it('returns null for a multi-role positional mode — no single deterministic role to assign', () => {
    expect(soleAdvertisedRole(makeAishaVideoModelInfo(), 'flf2v')).toBeNull();
  });

  it('returns null for a source-free mode', () => {
    expect(soleAdvertisedRole(makeAishaVideoModelInfo(), 't2v')).toBeNull();
  });
});
