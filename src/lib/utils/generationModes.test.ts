import { describe, it, expect } from 'vitest';
import {
  GENERATION_MODES,
  MODES_REQUIRING_SOURCE,
  MODEL_TYPES,
  isGenerationMode,
  modeRequiresSource,
  isModelType,
  enabledModes,
  findModelInfo,
  resolveModelForMode,
} from './generationModes';
import type { components } from '$lib/api/types';
import { makeGrokImageModelInfo, makeAishaImageModelInfo } from '../../mocks/factories/providers';

type ModelInfo = components['schemas']['ModelInfo'];
type ProvidersResponse = components['schemas']['ProvidersResponse'];
type ProviderInfo = ProvidersResponse['providers'][number];

function makeProviderInfo(
  models: ModelInfo[],
  overrides: Partial<ProviderInfo> = {},
): ProviderInfo {
  return {
    provider: 'grok',
    name: 'xAI Grok',
    available: true,
    provisioning_mode: 'always_on',
    models,
    ...overrides,
  };
}

describe('isGenerationMode', () => {
  it('accepts every known mode', () => {
    for (const mode of GENERATION_MODES) {
      expect(isGenerationMode(mode)).toBe(true);
    }
  });

  it('rejects junk values', () => {
    expect(isGenerationMode('bogus')).toBe(false);
    expect(isGenerationMode('')).toBe(false);
    expect(isGenerationMode(null)).toBe(false);
    expect(isGenerationMode(undefined)).toBe(false);
  });
});

describe('modeRequiresSource', () => {
  it('is true for i2i, i2v, v2v, flf2v', () => {
    for (const mode of MODES_REQUIRING_SOURCE) {
      expect(modeRequiresSource(mode)).toBe(true);
    }
  });

  it('is false for t2i and t2v', () => {
    expect(modeRequiresSource('t2i')).toBe(false);
    expect(modeRequiresSource('t2v')).toBe(false);
  });
});

describe('isModelType', () => {
  it('accepts every known model key', () => {
    for (const key of MODEL_TYPES) {
      expect(isModelType(key)).toBe(true);
    }
  });

  it('rejects junk values', () => {
    expect(isModelType('bogus-model')).toBe(false);
    expect(isModelType('')).toBe(false);
  });
});

describe('enabledModes', () => {
  it('collects modes across providers, only from enabled models', () => {
    const providers: ProvidersResponse = {
      providers: [
        makeProviderInfo([
          makeGrokImageModelInfo({ is_enabled: true, capabilities: ['t2i', 'i2i'] }),
        ]),
        makeProviderInfo(
          [
            makeAishaImageModelInfo({
              model_key: 'grok-imagine-video',
              is_enabled: true,
              capabilities: ['t2v', 'i2v'],
            }),
          ],
          { provider: 'aisha' },
        ),
      ],
      user_context: null,
    };
    expect(enabledModes(providers)).toEqual(new Set(['t2i', 'i2i', 't2v', 'i2v']));
  });

  it('excludes capabilities that only a disabled model has', () => {
    const providers: ProvidersResponse = {
      providers: [
        makeProviderInfo([
          makeGrokImageModelInfo({ is_enabled: true, capabilities: ['t2i'] }),
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-video',
            is_enabled: false,
            capabilities: ['flf2v'],
          }),
        ]),
      ],
      user_context: null,
    };
    expect(enabledModes(providers)).toEqual(new Set(['t2i']));
  });

  it('ignores unrecognized capability strings from the backend', () => {
    const providers: ProvidersResponse = {
      providers: [
        makeProviderInfo([
          makeGrokImageModelInfo({ is_enabled: true, capabilities: ['t2i', 'panorama'] }),
        ]),
      ],
      user_context: null,
    };
    expect(enabledModes(providers)).toEqual(new Set(['t2i']));
  });

  it('returns an empty set for null/undefined providers', () => {
    expect(enabledModes(null)).toEqual(new Set());
    expect(enabledModes(undefined)).toEqual(new Set());
  });
});

describe('findModelInfo', () => {
  it('finds a model by key across providers', () => {
    const model = makeGrokImageModelInfo({ model_key: 'grok-2-image-1212' });
    const providers: ProvidersResponse = {
      providers: [makeProviderInfo([model])],
      user_context: null,
    };
    expect(findModelInfo(providers, 'grok-2-image-1212')).toEqual(model);
  });

  it('returns null when the key is not found', () => {
    const providers: ProvidersResponse = {
      providers: [makeProviderInfo([makeGrokImageModelInfo()])],
      user_context: null,
    };
    expect(findModelInfo(providers, 'unknown-model')).toBeNull();
  });

  it('returns null for a null/undefined key', () => {
    expect(findModelInfo(undefined, null)).toBeNull();
    expect(findModelInfo(undefined, undefined)).toBeNull();
  });
});

describe('resolveModelForMode', () => {
  it('rung 1 — returns preferred when it is enabled and capable', () => {
    const providers: ProvidersResponse = {
      providers: [
        makeProviderInfo([
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-image',
            is_enabled: true,
            capabilities: ['t2i', 'i2i'],
          }),
        ]),
      ],
      user_context: null,
    };
    expect(resolveModelForMode(providers, 'i2i', 'grok-imagine-image')).toBe('grok-imagine-image');
  });

  it('rung 2 — falls back to a capable enabled model from the same provider as preferred', () => {
    const providers: ProvidersResponse = {
      providers: [
        makeProviderInfo([
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-image',
            is_enabled: true,
            capabilities: ['t2i', 'i2i'], // image-only — cannot serve i2v
          }),
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-video',
            is_enabled: true,
            capabilities: ['t2v', 'i2v'],
          }),
        ]),
        makeProviderInfo(
          [
            makeAishaImageModelInfo({
              model_key: 'aisha-video',
              is_enabled: true,
              capabilities: ['i2v'],
            }),
          ],
          { provider: 'aisha' },
        ),
      ],
      user_context: null,
    };
    // preferred is grok-imagine-image (image-only); same-provider grok-imagine-video covers i2v
    // and must win over aisha-video, which is earlier in provider order but a different family.
    expect(resolveModelForMode(providers, 'i2v', 'grok-imagine-image')).toBe('grok-imagine-video');
  });

  it('rung 3 — falls back to the first enabled capable model in provider order when preferred is unknown', () => {
    const providers: ProvidersResponse = {
      providers: [
        makeProviderInfo([
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-video',
            is_enabled: true,
            capabilities: ['i2v'],
          }),
        ]),
      ],
      user_context: null,
    };
    expect(resolveModelForMode(providers, 'i2v', 'nonexistent-model')).toBe('grok-imagine-video');
    expect(resolveModelForMode(providers, 'i2v', null)).toBe('grok-imagine-video');
    expect(resolveModelForMode(providers, 'i2v')).toBe('grok-imagine-video');
  });

  it('rung 4 — returns null when nothing is capable', () => {
    const providers: ProvidersResponse = {
      providers: [
        makeProviderInfo([
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-image',
            is_enabled: true,
            capabilities: ['t2i', 'i2i'],
          }),
        ]),
      ],
      user_context: null,
    };
    expect(resolveModelForMode(providers, 'flf2v', 'grok-imagine-image')).toBeNull();
  });

  it('disabled models are never selected, at any rung', () => {
    const providers: ProvidersResponse = {
      providers: [
        makeProviderInfo([
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-image',
            is_enabled: false,
            capabilities: ['t2i', 'i2i'],
          }),
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-video',
            is_enabled: false,
            capabilities: ['i2v'],
          }),
        ]),
      ],
      user_context: null,
    };
    expect(resolveModelForMode(providers, 'i2i', 'grok-imagine-image')).toBeNull();
    expect(resolveModelForMode(providers, 'i2v')).toBeNull();
  });

  it('returns null for empty/undefined providers', () => {
    expect(resolveModelForMode(undefined, 't2i', 'grok-imagine-image')).toBeNull();
    expect(resolveModelForMode({ providers: [], user_context: null }, 't2i')).toBeNull();
  });
});
