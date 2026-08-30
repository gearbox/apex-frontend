import { describe, expect, it } from 'vitest';
import { createSupportedModes, enabledModes, resolveModelForMode } from './generationModes';
import { makeGrokImageModelInfo } from '../../mocks/factories/providers';
import type { components } from '$lib/api/types';

type ProvidersResponse = components['schemas']['ProvidersResponse'];

describe('provider-discovered modes', () => {
  it('uses every advertised capability without a frontend create-mode list', () => {
    const info = makeGrokImageModelInfo({ capabilities: ['t2i', 'future-edit'] });
    expect(createSupportedModes(info)).toEqual(['t2i', 'future-edit']);
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
            makeGrokImageModelInfo({ is_enabled: false, capabilities: ['t2i'] }),
            makeGrokImageModelInfo({
              model_key: 'grok-2-image-1212',
              capabilities: ['future-edit'],
            }),
          ],
        },
      ],
      user_context: null,
    };
    expect(enabledModes(providers)).toEqual(new Set(['future-edit']));
    expect(resolveModelForMode(providers, 'future-edit')).toBe('grok-2-image-1212');
  });
});
