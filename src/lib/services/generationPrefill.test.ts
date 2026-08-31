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

  it('keeps v2v on input_video_url and never reconstructs source_media', () => {
    const discovery = providers([makeGrokImageModelInfo({ capabilities: ['v2v'] })]);
    const result = replayGenerationPrefill(
      { generation_type: 'v2v', model: 'grok-imagine-image', prompt: 'extend this' },
      discovery,
      group({
        media_type: 'video',
        generation_type: 'v2v',
        input_media: {
          media_type: 'video',
          original: {
            url: '/v1/content/outputs/video',
            content_type: 'video/mp4',
            size_bytes: 1,
          },
          variants: [],
        },
      }),
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.params.inputVideoUrl).toBe('/v1/content/outputs/video');
      expect(result.params.sourceMedia).toBeUndefined();
    }
  });
});
