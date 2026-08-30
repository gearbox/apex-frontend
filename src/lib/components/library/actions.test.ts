import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import { resolveLibraryAction, type LibraryActionDeps } from './actions';
import { makeLibraryAssetDetail } from '../../../mocks/factories/library';
import { makeMediaObject, makeVideoMediaObject } from '../../../mocks/factories/media';
import { makeGrokImageModelInfo } from '../../../mocks/factories/providers';
import type { components } from '$lib/api/types';

const { addToastMock } = vi.hoisted(() => ({ addToastMock: vi.fn() }));
vi.mock('$lib/stores/toasts', () => ({ addToast: addToastMock }));

type ProvidersResponse = components['schemas']['ProvidersResponse'];

const SOURCE_A = 'upload:11111111-1111-1111-1111-111111111111';
const SOURCE_B = 'output:22222222-2222-2222-2222-222222222222';
const asset = makeLibraryAssetDetail({
  asset_ref: 'output:33333333-3333-3333-3333-333333333333',
  job_id: 'job-1',
  generation_type: 'i2i',
  model: 'grok-imagine-image',
});

function providers(): ProvidersResponse {
  return {
    providers: [
      {
        provider: 'grok',
        name: 'Grok',
        available: true,
        provisioning_mode: 'always_on',
        models: [makeGrokImageModelInfo({ capabilities: ['t2i', 'i2i', 'v2v'] })],
      },
    ],
    user_context: null,
  };
}

function deps(
  groupSources: components['schemas']['LibrarySourceMediaItem'][],
  groupOverrides: Partial<components['schemas']['LibraryGroupDetail']> = {},
): LibraryActionDeps {
  return {
    providers: providers(),
    loadDetail: vi.fn().mockResolvedValue(asset),
    loadGroup: vi.fn().mockResolvedValue({
      job_id: 'job-1',
      badge: 'image',
      input_media: null,
      source_media: groupSources,
      prompt: 'original prompt',
      negative_prompt: null,
      outputs: [],
      media_type: 'image',
      model: 'grok-imagine-image',
      provider: 'grok',
      generation_type: 'i2i',
      aspect_ratio: null,
      token_cost: 1,
      created_at: '2026-01-01T00:00:00Z',
      completed_at: null,
      lineage: null,
      ...groupOverrides,
    }),
    navigate: vi.fn(),
  };
}

beforeEach(() => {
  generationStore.reset();
  addToastMock.mockClear();
});

describe('Re-Generate source-media replay', () => {
  it('replays ordered group source_media verbatim, not legacy input_media', async () => {
    const action = resolveLibraryAction(
      'reproduce',
      asset,
      {},
      deps([
        { position: 1, asset_ref: SOURCE_B, available: true, media: makeMediaObject() },
        { position: 0, asset_ref: SOURCE_A, available: true, media: makeMediaObject() },
      ]),
    );
    await action?.();
    expect(get(generationStore).sourceMedia.map((source) => source.assetRef)).toEqual([
      SOURCE_A,
      SOURCE_B,
    ]);
  });

  it('keeps unavailable positions as placeholders instead of silently shortening a replay', async () => {
    const action = resolveLibraryAction(
      'reproduce',
      asset,
      {},
      deps([
        { position: 0, asset_ref: SOURCE_A, available: true, media: makeMediaObject() },
        { position: 1, asset_ref: SOURCE_B, available: false, media: null },
      ]),
    );
    await action?.();
    const sources = get(generationStore).sourceMedia;
    expect(sources).toHaveLength(2);
    expect(sources[1]).toMatchObject({ assetRef: SOURCE_B, available: false, previewUrl: null });
  });

  it('prefills source actions with the canonical asset ref', async () => {
    const sourceAsset = { ...asset, asset_ref: SOURCE_B, media: makeMediaObject() };
    const action = resolveLibraryAction('use_as_reference', sourceAsset, {}, deps([]));
    await action?.();
    expect(get(generationStore).sourceMedia).toMatchObject([
      { assetRef: SOURCE_B, available: true },
    ]);
  });

  it('keeps v2v on inputVideoUrl rather than forcing the video into sourceMedia', async () => {
    const videoAsset = {
      ...asset,
      asset_ref: SOURCE_B,
      media: makeMediaObject({
        media_type: 'video',
        original: { url: '/v1/content/outputs/video', content_type: 'video/mp4', size_bytes: 1 },
      }),
    };
    const actionDeps = deps([]);
    actionDeps.loadDetail = vi.fn().mockResolvedValue(videoAsset);
    const action = resolveLibraryAction('extend', videoAsset, {}, actionDeps);
    await action?.();
    expect(get(generationStore).inputVideoUrl).toBe('/v1/content/outputs/video');
    expect(get(generationStore).sourceMedia).toEqual([]);
  });

  it('reproduces v2v through the group video URL, never through source_media', async () => {
    const v2vAsset = {
      ...asset,
      generation_type: 'v2v' as const,
      model: 'grok-imagine-image',
    };
    const actionDeps = deps([], { input_media: makeVideoMediaObject() });
    actionDeps.loadDetail = vi.fn().mockResolvedValue(v2vAsset);
    const action = resolveLibraryAction('reproduce', v2vAsset, {}, actionDeps);
    await action?.();
    expect(get(generationStore).inputVideoUrl).toBe('/v1/content/outputs/vid_mock_001');
    expect(get(generationStore).sourceMedia).toEqual([]);
  });
});
