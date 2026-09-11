import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import {
  filterVisibleLibraryActions,
  libraryActionGroup,
  resolveLibraryAction,
  type LibraryActionDeps,
} from './actions';
import { makeLibraryAssetDetail } from '../../../mocks/factories/library';
import { makeMediaObject, makeVideoMediaObject } from '../../../mocks/factories/media';
import { makeGrokImageModelInfo, generationModes } from '../../../mocks/factories/providers';
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
        models: [
          makeGrokImageModelInfo({ generation_modes: generationModes(['t2i', 'i2i', 'v2v']) }),
        ],
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

  it('prefills extend (v2v) with the owned video source, not a video URL', async () => {
    const videoAsset = {
      ...asset,
      asset_ref: SOURCE_B,
      media: makeVideoMediaObject(),
    };
    const actionDeps = deps([]);
    actionDeps.loadDetail = vi.fn().mockResolvedValue(videoAsset);
    const action = resolveLibraryAction('extend', videoAsset, {}, actionDeps);
    await action?.();
    expect(get(generationStore).mode).toBe('v2v');
    expect(get(generationStore).sourceMedia).toMatchObject([
      { assetRef: SOURCE_B, available: true },
    ]);
  });

  it('replays a v2v Re-Generate through group.source_media like every other mode', async () => {
    const v2vAsset = {
      ...asset,
      generation_type: 'v2v' as const,
      model: 'grok-imagine-image',
    };
    const actionDeps = deps(
      [{ position: 0, asset_ref: SOURCE_B, available: true, media: makeVideoMediaObject() }],
      { generation_type: 'v2v', media_type: 'video' },
    );
    actionDeps.loadDetail = vi.fn().mockResolvedValue(v2vAsset);
    const action = resolveLibraryAction('reproduce', v2vAsset, {}, actionDeps);
    await action?.();
    expect(actionDeps.navigate).toHaveBeenCalled();
    expect(get(generationStore).mode).toBe('v2v');
    expect(get(generationStore).sourceMedia).toMatchObject([{ assetRef: SOURCE_B }]);
  });

  it('does not navigate when no current model can preserve an original optional source', async () => {
    const actionDeps = deps([
      { position: 0, asset_ref: SOURCE_A, available: true, media: makeMediaObject() },
    ]);
    actionDeps.providers = {
      providers: [
        {
          provider: 'grok',
          name: 'Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            makeGrokImageModelInfo({
              generation_modes: generationModes(['i2i'], { i2i: null }),
            }),
          ],
        },
      ],
      user_context: null,
    };

    await resolveLibraryAction('reproduce', asset, {}, actionDeps)?.();

    expect(actionDeps.navigate).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalled();
  });
});

describe('Library action visibility and provenance', () => {
  it('filters unavailable mode actions, preserves order, and expands download by platform capability', () => {
    expect(
      filterVisibleLibraryActions(['remix', 'animate', 'download', 'favorite'], {
        availableModes: new Set(['i2i']),
        saveCapabilities: ['share', 'download'],
      }),
    ).toEqual(['remix', 'share', 'download', 'favorite']);
    expect(
      filterVisibleLibraryActions(['use_as_first_frame'], {
        availableModes: new Set(),
        saveCapabilities: ['download'],
      }),
    ).toEqual([]);
    expect(
      filterVisibleLibraryActions(['reproduce', 'extend'], {
        availableModes: new Set(['v2v']),
        generationType: 'v2v',
        saveCapabilities: ['download'],
      }),
    ).toEqual(['reproduce', 'extend']);
  });

  it('keeps save actions independent while serializing source/replay navigation actions', () => {
    expect(libraryActionGroup('share')).toBe('save');
    expect(libraryActionGroup('download')).toBe('save');
    expect(libraryActionGroup('remix')).toBe('navigate');
    expect(libraryActionGroup('reproduce')).toBe('navigate');
    expect(libraryActionGroup('favorite')).toBeNull();
  });

  it('copies provenance prompt fields for Remix while source-only references preserve the draft', async () => {
    generationStore.prefill({ prompt: 'my draft', negativePrompt: 'my negative' });
    const remixed = { ...asset, prompt: 'original', negative_prompt: 'original negative' };
    const remixDeps = deps([]);
    remixDeps.loadDetail = vi.fn().mockResolvedValue(remixed);
    await resolveLibraryAction('remix', remixed, {}, remixDeps)?.();
    expect(get(generationStore)).toMatchObject({
      prompt: 'original',
      negativePrompt: 'original negative',
    });

    generationStore.prefill({ prompt: 'my draft', negativePrompt: 'my negative' });
    await resolveLibraryAction('use_as_reference', remixed, {}, deps([]))?.();
    expect(get(generationStore)).toMatchObject({
      prompt: 'my draft',
      negativePrompt: 'my negative',
    });
  });

  it('does not navigate when no enabled model can satisfy the requested source action', async () => {
    const noModelDeps = deps([]);
    noModelDeps.providers = {
      providers: [],
      user_context: null,
    };
    const action = resolveLibraryAction('animate', asset, {}, noModelDeps);
    await action?.();
    expect(noModelDeps.navigate).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalled();
  });
});
