import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { components } from '$lib/api/types';
import { generationStore, type SourceMediaDraft } from '$lib/stores/generation';
import {
  prefillRoleSourceForGeneration,
  prefillSourceForGeneration,
  replayGenerationPrefill,
} from './generationPrefill';
import {
  makeAishaVideoModelInfo,
  makeGrokImageModelInfo,
  makeGrokVideoModelInfo,
  generationModes,
} from '../../mocks/factories/providers';

type ProvidersResponse = components['schemas']['ProvidersResponse'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];

const source: SourceMediaDraft = {
  assetRef: 'output:source-a',
  mediaType: 'image',
  previewUrl: '/v1/content/outputs/source-a',
  label: 'From generated',
  available: true,
  role: null,
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
    const discovery = providers([
      makeGrokImageModelInfo({ generation_modes: generationModes(['t2i', 'i2i']) }),
    ]);
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
      makeGrokImageModelInfo({ generation_modes: generationModes(['t2i']) }),
      makeGrokImageModelInfo({
        model_key: 'grok-2-image-1212',
        generation_modes: generationModes(['i2i']),
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
    const discovery = providers([
      makeGrokImageModelInfo({ generation_modes: generationModes(['t2i']) }),
    ]);
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
        generation_modes: generationModes(['t2i'], { t2i: null }),
      }),
      makeGrokImageModelInfo({
        model_key: 'grok-2-image-1212',
        generation_modes: generationModes(['t2i'], {
          t2i: { min: 0, max: 4, media_types: ['image'], roles: null },
        }),
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
      makeGrokImageModelInfo({ generation_modes: generationModes(['t2i'], { t2i: null }) }),
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
        generation_modes: generationModes(['i2i'], {
          i2i: { min: 1, max: 1, media_types: ['image'], roles: null },
        }),
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
        generation_modes: generationModes(['i2i'], {
          i2i: { min: 1, max: 4, media_types: ['image'], roles: null },
        }),
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
    const discovery = providers([
      makeGrokImageModelInfo({ generation_modes: generationModes(['i2i']) }),
    ]);
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
    const discovery = providers([
      makeGrokImageModelInfo({ generation_modes: generationModes(['i2i']) }),
    ]);
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

  it('replays a v2v group source through the same source_media path as every other mode', () => {
    const discovery = providers([
      makeGrokImageModelInfo({ generation_modes: generationModes(['v2v']) }),
    ]);
    const result = replayGenerationPrefill(
      { generation_type: 'v2v', model: 'grok-imagine-image', prompt: 'extend this' },
      discovery,
      group({
        media_type: 'video',
        generation_type: 'v2v',
        source_media: [
          {
            position: 0,
            asset_ref: 'upload:video-1',
            available: true,
            media: sourceMedia('video'),
          },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.params.mode).toBe('v2v');
      expect(result.params.sourceMedia).toMatchObject([{ assetRef: 'upload:video-1', role: null }]);
    }
  });

  it('hydrates positional roles from the live model contract, by historical position', () => {
    const discovery = providers([makeAishaVideoModelInfo()]);
    const result = replayGenerationPrefill(
      { generation_type: 'flf2v', model: 'aisha-video', prompt: 'original prompt' },
      discovery,
      group({
        generation_type: 'flf2v',
        model: 'aisha-video',
        media_type: 'video',
        source_media: [
          { position: 0, asset_ref: 'upload:first', available: true, media: sourceMedia('image') },
          { position: 1, asset_ref: 'upload:last', available: true, media: sourceMedia('image') },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.params.sourceMedia).toMatchObject([
        { assetRef: 'upload:first', role: 'first_frame' },
        { assetRef: 'upload:last', role: 'last_frame' },
      ]);
    }
  });

  it('preserves the semantic role on an unavailable replay position', () => {
    const discovery = providers([makeAishaVideoModelInfo()]);
    const result = replayGenerationPrefill(
      { generation_type: 'flf2v', model: 'aisha-video', prompt: 'original prompt' },
      discovery,
      group({
        generation_type: 'flf2v',
        model: 'aisha-video',
        media_type: 'video',
        source_media: [
          { position: 0, asset_ref: 'upload:first', available: true, media: sourceMedia('image') },
          { position: 1, asset_ref: 'upload:last', available: false, media: null },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.params.sourceMedia).toMatchObject([
        { assetRef: 'upload:first', role: 'first_frame', available: true },
        { assetRef: 'upload:last', role: 'last_frame', available: false },
      ]);
    }
  });

  it('reordered group entries are sorted by position before role assignment', () => {
    const discovery = providers([makeAishaVideoModelInfo()]);
    const result = replayGenerationPrefill(
      { generation_type: 'flf2v', model: 'aisha-video', prompt: 'original prompt' },
      discovery,
      group({
        generation_type: 'flf2v',
        model: 'aisha-video',
        media_type: 'video',
        source_media: [
          { position: 1, asset_ref: 'upload:last', available: true, media: sourceMedia('image') },
          { position: 0, asset_ref: 'upload:first', available: true, media: sourceMedia('image') },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.params.sourceMedia).toMatchObject([
        { assetRef: 'upload:first', role: 'first_frame' },
        { assetRef: 'upload:last', role: 'last_frame' },
      ]);
    }
  });

  it('fails closed when the live positional role count no longer matches the historical position count', () => {
    const discovery = providers([makeAishaVideoModelInfo()]);
    const result = replayGenerationPrefill(
      { generation_type: 'flf2v', model: 'aisha-video', prompt: 'original prompt' },
      discovery,
      group({
        generation_type: 'flf2v',
        model: 'aisha-video',
        media_type: 'video',
        // Only one historical position, but the live flf2v contract fixes
        // exactly two roles — must never silently replay a shorter list.
        source_media: [
          { position: 0, asset_ref: 'upload:first', available: true, media: sourceMedia('image') },
        ],
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'incompatible-source-policy' });
  });

  it('replays a mixed-kind positional contract only when every persisted position matches its role kind', () => {
    const discovery = providers([
      makeGrokImageModelInfo({
        generation_modes: generationModes(['mixed-positional'], {
          'mixed-positional': {
            min: 2,
            max: 2,
            media_types: ['image', 'video'],
            roles: ['first_frame', 'source'],
          },
        }),
      }),
    ]);
    const result = replayGenerationPrefill(
      {
        generation_type: 'mixed-positional',
        model: 'grok-imagine-image',
        prompt: 'original prompt',
      },
      discovery,
      group({
        source_media: [
          { position: 0, asset_ref: 'upload:first', available: true, media: sourceMedia('image') },
          { position: 1, asset_ref: 'upload:source', available: true, media: sourceMedia('video') },
        ],
      }),
    );

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.params.sourceMedia).toMatchObject([
        { assetRef: 'upload:first', role: 'first_frame' },
        { assetRef: 'upload:source', role: 'source' },
      ]);
    }
  });

  it('rejects a mixed-kind positional replay with the source kinds reversed', () => {
    const discovery = providers([
      makeGrokImageModelInfo({
        generation_modes: generationModes(['mixed-positional'], {
          'mixed-positional': {
            min: 2,
            max: 2,
            media_types: ['image', 'video'],
            roles: ['first_frame', 'source'],
          },
        }),
      }),
    ]);

    expect(
      replayGenerationPrefill(
        {
          generation_type: 'mixed-positional',
          model: 'grok-imagine-image',
          prompt: 'original prompt',
        },
        discovery,
        group({
          source_media: [
            {
              position: 0,
              asset_ref: 'upload:source',
              available: true,
              media: sourceMedia('video'),
            },
            {
              position: 1,
              asset_ref: 'upload:first',
              available: true,
              media: sourceMedia('image'),
            },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: 'incompatible-source-policy' });
  });
});

describe('prefillSourceForGeneration — role derived from the resolved model contract', () => {
  it('tags the source with the resolved mode’s sole advertised role', () => {
    const discovery = providers([makeAishaVideoModelInfo()]);
    expect(prefillSourceForGeneration({ providers: discovery, mode: 'i2v', source })).toBe(true);
    expect(get(generationStore).sourceMedia).toMatchObject([{ role: 'first_frame' }]);
  });

  it('keeps the source generic for a roleless target mode', () => {
    const discovery = providers([makeGrokVideoModelInfo()]);
    expect(prefillSourceForGeneration({ providers: discovery, mode: 'i2v', source })).toBe(true);
    expect(get(generationStore).sourceMedia).toMatchObject([{ role: null }]);
  });
});

describe('prefillRoleSourceForGeneration', () => {
  it('resolves a role-capable enabled model and tags the source with the requested role', () => {
    const discovery = providers([makeAishaVideoModelInfo()]);
    expect(
      prefillRoleSourceForGeneration({ providers: discovery, role: 'last_frame', source }),
    ).toBe(true);
    expect(get(generationStore)).toMatchObject({
      model: 'aisha-video',
      sourceMedia: [{ ...source, role: 'last_frame' }],
    });
  });

  it('preserves the existing draft prompt (does not overwrite it)', () => {
    generationStore.prefill({ prompt: 'my draft in progress' });
    const discovery = providers([makeAishaVideoModelInfo()]);
    prefillRoleSourceForGeneration({ providers: discovery, role: 'first_frame', source });
    expect(get(generationStore).prompt).toBe('my draft in progress');
  });

  it('returns false and does not touch the draft when no enabled model supports the role', () => {
    const discovery = providers([makeGrokVideoModelInfo()]); // roles: null everywhere
    expect(
      prefillRoleSourceForGeneration({ providers: discovery, role: 'first_frame', source }),
    ).toBe(false);
    expect(get(generationStore).sourceMedia).toEqual([]);
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
