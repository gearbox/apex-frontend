import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { components } from '$lib/api/types';
import { generationStore, type SourceMediaDraft } from '$lib/stores/generation';
import { prefillSourceForGeneration, replayGenerationPrefill } from './generationPrefill';
import { makeGrokImageModelInfo } from '../../mocks/factories/providers';

type ProvidersResponse = components['schemas']['ProvidersResponse'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];

const source: SourceMediaDraft = {
  assetRef: 'output:source-a',
  mediaType: 'image',
  previewUrl: '/v1/content/outputs/source-a',
  label: 'From generated',
  available: true,
};

function providers(models: components['schemas']['ModelInfo'][]): ProvidersResponse {
  return {
    providers: [
      {
        provider: 'grok',
        name: 'Grok',
        available: true,
        provisioning_mode: 'always_on',
        models,
      },
    ],
    user_context: null,
  };
}

function group(overrides: Partial<LibraryGroupDetail> = {}): LibraryGroupDetail {
  return {
    job_id: 'job-1',
    badge: 'image',
    input_media: null,
    source_media: [],
    prompt: 'original prompt',
    negative_prompt: null,
    outputs: [],
    media_type: 'image',
    model: 'grok-imagine-image',
    provider: 'grok',
    generation_type: 'i2i',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => generationStore.reset());

describe('capability-aware source prefill', () => {
  it('uses the current enabled capable model for an I2I source', () => {
    const discovery = providers([makeGrokImageModelInfo({ capabilities: ['t2i', 'i2i'] })]);
    expect(
      prefillSourceForGeneration({
        providers: discovery,
        mode: 'i2i',
        preferredModel: 'grok-imagine-image',
        source,
      }),
    ).toBe(true);
    expect(get(generationStore)).toMatchObject({
      model: 'grok-imagine-image',
      mode: 'i2i',
      sourceMedia: [source],
    });
  });

  it('resolves another enabled capable model when the selected one cannot accept I2I', () => {
    const discovery = providers([
      makeGrokImageModelInfo({ capabilities: ['t2i'] }),
      makeGrokImageModelInfo({
        model_key: 'grok-2-image-1212',
        capabilities: ['i2i'],
      }),
    ]);
    expect(
      prefillSourceForGeneration({
        providers: discovery,
        mode: 'i2i',
        preferredModel: 'grok-imagine-image',
        source,
      }),
    ).toBe(true);
    expect(get(generationStore).model).toBe('grok-2-image-1212');
  });

  it('does not change the draft or navigate intent when no capable model exists', () => {
    const discovery = providers([makeGrokImageModelInfo({ capabilities: ['t2i'] })]);
    expect(
      prefillSourceForGeneration({
        providers: discovery,
        mode: 'i2i',
        preferredModel: 'grok-imagine-image',
        source,
      }),
    ).toBe(false);
    expect(get(generationStore).sourceMedia).toEqual([]);
  });
});

describe('replayGenerationPrefill', () => {
  it('uses another compatible model when the original optional t2i source is no longer accepted', () => {
    const discovery = providers([
      makeGrokImageModelInfo({
        capabilities: ['t2i'],
        inputs: { source_media: null },
      }),
      makeGrokImageModelInfo({
        model_key: 'grok-2-image-1212',
        capabilities: ['t2i'],
        inputs: {
          source_media: {
            min: 1,
            max: 4,
            media_types: ['image'],
            required_for: [],
          },
        },
      }),
    ]);

    const result = replayGenerationPrefill(
      { generation_type: 't2i', model: 'grok-imagine-image', prompt: 'original prompt' },
      discovery,
      group({
        generation_type: 't2i',
        source_media: [
          {
            position: 0,
            asset_ref: 'upload:optional-source',
            available: true,
            media: {
              media_type: 'image',
              original: {
                url: '/v1/content/uploads/optional-source',
                content_type: 'image/png',
                size_bytes: 1,
              },
              variants: [],
            },
          },
        ],
      }),
    );

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.params.model).toBe('grok-2-image-1212');
      expect(result.params.sourceMedia).toMatchObject([{ assetRef: 'upload:optional-source' }]);
    }
  });

  it('fails explicitly rather than dropping optional t2i sources when no current model accepts them', () => {
    const discovery = providers([
      makeGrokImageModelInfo({ capabilities: ['t2i'], inputs: { source_media: null } }),
    ]);

    expect(
      replayGenerationPrefill(
        { generation_type: 't2i', model: 'grok-imagine-image', prompt: 'original prompt' },
        discovery,
        group({
          generation_type: 't2i',
          source_media: [
            {
              position: 0,
              asset_ref: 'upload:optional-source',
              available: true,
              media: {
                media_type: 'image',
                original: {
                  url: '/v1/content/uploads/optional-source',
                  content_type: 'image/png',
                  size_bytes: 1,
                },
                variants: [],
              },
            },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: 'incompatible-source-policy' });
  });

  it('fails rather than truncating a replay whose original source count exceeds the live max', () => {
    const discovery = providers([
      makeGrokImageModelInfo({
        capabilities: ['i2i'],
        inputs: {
          source_media: {
            min: 1,
            max: 1,
            media_types: ['image'],
            required_for: ['i2i'],
          },
        },
      }),
    ]);

    expect(
      replayGenerationPrefill(
        { generation_type: 'i2i', model: 'grok-imagine-image', prompt: 'original prompt' },
        discovery,
        group({
          source_media: [
            {
              position: 0,
              asset_ref: 'upload:first',
              available: true,
              media: sourceMedia('image'),
            },
            {
              position: 1,
              asset_ref: 'upload:second',
              available: true,
              media: sourceMedia('image'),
            },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: 'incompatible-source-policy' });
  });

  it('requires every available persisted media kind to be accepted by the replay model', () => {
    const discovery = providers([
      makeGrokImageModelInfo({
        capabilities: ['i2i'],
        inputs: {
          source_media: {
            min: 1,
            max: 4,
            media_types: ['image'],
            required_for: ['i2i'],
          },
        },
      }),
    ]);

    expect(
      replayGenerationPrefill(
        { generation_type: 'i2i', model: 'grok-imagine-image', prompt: 'original prompt' },
        discovery,
        group({
          source_media: [
            {
              position: 0,
              asset_ref: 'upload:video',
              available: true,
              media: sourceMedia('video'),
            },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: 'incompatible-source-policy' });
  });

  it('replays ordered source positions and unavailable sources without normalizing them away', () => {
    const discovery = providers([makeGrokImageModelInfo({ capabilities: ['i2i'] })]);
    const result = replayGenerationPrefill(
      {
        generation_type: 'i2i',
        model: 'grok-imagine-image',
        prompt: 'original prompt',
      },
      discovery,
      group({
        source_media: [
          {
            position: 1,
            asset_ref: 'upload:second',
            available: false,
            media: null,
          },
          {
            position: 0,
            asset_ref: 'upload:first',
            available: true,
            media: {
              media_type: 'image',
              original: {
                url: '/v1/content/uploads/first',
                content_type: 'image/png',
                size_bytes: 1,
              },
              variants: [],
            },
          },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.params.sourceMedia?.map((item) => [item.assetRef, item.available])).toEqual([
        ['upload:first', true],
        ['upload:second', false],
      ]);
    }
  });

  it('rejects a duplicate group replay rather than silently changing its source count', () => {
    const discovery = providers([makeGrokImageModelInfo({ capabilities: ['i2i'] })]);
    expect(
      replayGenerationPrefill(
        { generation_type: 'i2i', model: 'grok-imagine-image', prompt: 'original prompt' },
        discovery,
        group({
          source_media: [
            { position: 0, asset_ref: 'upload:repeat', available: true, media: null },
            { position: 1, asset_ref: 'upload:repeat', available: true, media: null },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: 'duplicate-source' });
  });

  it('does not claim exact v2v replay when the group has no persisted input URL', () => {
    const discovery = providers([makeGrokImageModelInfo({ capabilities: ['v2v'] })]);
    expect(
      replayGenerationPrefill(
        { generation_type: 'v2v', model: 'grok-imagine-image', prompt: 'extend this' },
        discovery,
        group({ media_type: 'video', generation_type: 'v2v', input_media: null, source_media: [] }),
      ),
    ).toEqual({ ok: false, reason: 'legacy-v2v-source-unavailable' });
  });
});

function sourceMedia(media_type: 'image' | 'video'): components['schemas']['MediaObject'] {
  return {
    media_type,
    original: {
      url: `/v1/content/uploads/source.${media_type === 'image' ? 'png' : 'mp4'}`,
      content_type: media_type === 'image' ? 'image/png' : 'video/mp4',
      size_bytes: 1,
    },
    variants: [],
  };
}
