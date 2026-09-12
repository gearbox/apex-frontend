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
import {
  makeAishaVideoModelInfo,
  makeGrokImageModelInfo,
  makeGrokVideoModelInfo,
  generationModes,
} from '../../../mocks/factories/providers';
import { enabledRoles } from '$lib/utils/generationModes';
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
      { assetRef: SOURCE_B, available: true, role: null },
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
    expect(libraryActionGroup('use_as_reference')).toBe('navigate');
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

function aishaVideoProviders(): ProvidersResponse {
  return {
    providers: [
      {
        provider: 'aisha',
        name: 'Aisha',
        available: true,
        provisioning_mode: 'always_on',
        models: [makeAishaVideoModelInfo()],
      },
    ],
    user_context: null,
  };
}

function grokVideoOnlyProviders(): ProvidersResponse {
  return {
    providers: [
      {
        provider: 'grok',
        name: 'Grok',
        available: true,
        provisioning_mode: 'always_on',
        models: [makeGrokVideoModelInfo()], // roles: null everywhere
      },
    ],
    user_context: null,
  };
}

function namedReferenceOnlyProviders(modelKey = 'reference-edit'): ProvidersResponse {
  return {
    providers: [
      {
        provider: 'future',
        name: 'Future provider',
        available: true,
        provisioning_mode: 'always_on',
        models: [
          makeGrokImageModelInfo({
            model_key: modelKey,
            generation_modes: generationModes(['custom-edit'], {
              'custom-edit': {
                min: 1,
                max: 1,
                media_types: ['image'],
                roles: ['reference'],
              },
            }),
          }),
        ],
      },
    ],
    user_context: null,
  };
}

describe('Phase 4 — role-capability-driven Library visibility', () => {
  it('shows use_as_first_frame / use_as_last_frame when an enabled provider actually advertises those roles', () => {
    const availableRoles = enabledRoles(aishaVideoProviders());
    expect(
      filterVisibleLibraryActions(['use_as_first_frame', 'use_as_last_frame'], {
        availableModes: new Set(),
        availableRoles,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['use_as_first_frame', 'use_as_last_frame']);
  });

  it('hides use_as_first_frame / use_as_last_frame for Grok-only (roleless) providers', () => {
    const availableRoles = enabledRoles(grokVideoOnlyProviders());
    expect(availableRoles.size).toBe(0);
    expect(
      filterVisibleLibraryActions(['use_as_first_frame', 'use_as_last_frame'], {
        availableModes: new Set(['i2v', 'v2v']),
        availableRoles,
        saveCapabilities: ['download'],
      }),
    ).toEqual([]);
  });

  it('never uses availableModes.has("flf2v") as a stand-in for role capability', () => {
    // A model set that happens to advertise a mode literally named "flf2v" but
    // with roles: null must still not surface the role-based actions.
    const providersWithRolelessFlf2v: ProvidersResponse = {
      providers: [
        {
          provider: 'grok',
          name: 'Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            makeGrokImageModelInfo({
              generation_modes: generationModes(['t2i', 'flf2v'], {
                flf2v: { min: 2, max: 2, media_types: ['image'], roles: null },
              }),
            }),
          ],
        },
      ],
      user_context: null,
    };
    expect(
      filterVisibleLibraryActions(['use_as_first_frame', 'use_as_last_frame'], {
        availableModes: new Set(['flf2v']),
        availableRoles: enabledRoles(providersWithRolelessFlf2v),
        saveCapabilities: ['download'],
      }),
    ).toEqual([]);
  });

  it('use_as_reference stays visible via its roleless i2i path even with no named reference role', () => {
    expect(
      filterVisibleLibraryActions(['use_as_reference'], {
        availableModes: new Set(['i2i']),
        availableRoles: new Set(),
        canUseReference: true,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['use_as_reference']);
  });

  it('hides use_as_reference when there is no executable reference target', () => {
    expect(
      filterVisibleLibraryActions(['use_as_reference'], {
        availableModes: new Set(['i2i']),
        availableRoles: new Set(['reference']),
        canUseReference: false,
        saveCapabilities: ['download'],
      }),
    ).toEqual([]);
  });
});

describe('Phase 4 — reference capability parity', () => {
  it('executes the named reference path without a hardcoded i2i mode and preserves the draft prompt', async () => {
    generationStore.prefill({ prompt: 'draft prompt' });
    const actionDeps = deps([]);
    actionDeps.providers = namedReferenceOnlyProviders();

    await resolveLibraryAction('use_as_reference', asset, {}, actionDeps)?.();

    expect(actionDeps.navigate).toHaveBeenCalled();
    expect(get(generationStore)).toMatchObject({
      model: 'reference-edit',
      mode: 'custom-edit',
      prompt: 'draft prompt',
      sourceMedia: [{ assetRef: asset.asset_ref, role: 'reference' }],
    });
  });

  it('prefers the originating compatible reference model when roleless and named paths are both available', async () => {
    const actionDeps = deps([]);
    actionDeps.providers = {
      providers: [
        {
          provider: 'mixed',
          name: 'Mixed',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            makeGrokImageModelInfo({ model_key: 'roleless-edit' }),
            ...namedReferenceOnlyProviders('named-reference-edit').providers[0].models,
          ],
        },
      ],
      user_context: null,
    };

    await resolveLibraryAction(
      'use_as_reference',
      { ...asset, model: 'named-reference-edit' },
      {},
      actionDeps,
    )?.();

    expect(get(generationStore)).toMatchObject({
      model: 'named-reference-edit',
      mode: 'custom-edit',
      sourceMedia: [{ role: 'reference' }],
    });
  });

  it('does not navigate when no reference path exists', async () => {
    const actionDeps = deps([]);
    actionDeps.providers = aishaVideoProviders();

    await resolveLibraryAction('use_as_reference', asset, {}, actionDeps)?.();

    expect(actionDeps.navigate).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalled();
  });
});

describe('Phase 4 — role-based prefill (use_as_first_frame / use_as_last_frame)', () => {
  function aishaAsset(overrides: Partial<typeof asset> = {}) {
    return makeLibraryAssetDetail({
      asset_ref: SOURCE_A,
      job_id: 'job-2',
      generation_type: 'i2v',
      model: 'aisha-video',
      media: makeMediaObject(),
      ...overrides,
    });
  }

  it('use_as_first_frame tags the source with role first_frame and preserves the draft prompt', async () => {
    generationStore.prefill({ prompt: 'my draft in progress' });
    const actionDeps = deps([]);
    actionDeps.providers = aishaVideoProviders();
    const action = resolveLibraryAction('use_as_first_frame', aishaAsset(), {}, actionDeps);
    await action?.();

    expect(actionDeps.navigate).toHaveBeenCalled();
    expect(get(generationStore)).toMatchObject({
      model: 'aisha-video',
      prompt: 'my draft in progress',
      sourceMedia: [{ assetRef: SOURCE_A, role: 'first_frame' }],
    });
  });

  it('use_as_last_frame tags the source with role last_frame, leaving Create in an incomplete FLF state', async () => {
    const actionDeps = deps([]);
    actionDeps.providers = aishaVideoProviders();
    const action = resolveLibraryAction('use_as_last_frame', aishaAsset(), {}, actionDeps);
    await action?.();

    expect(get(generationStore)).toMatchObject({
      model: 'aisha-video',
      sourceMedia: [{ assetRef: SOURCE_A, role: 'last_frame' }],
    });
  });

  it('prefers the asset’s originating model when it is enabled and role-capable', async () => {
    const providersMultiModel: ProvidersResponse = {
      providers: [
        {
          provider: 'aisha',
          name: 'Aisha',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            makeAishaVideoModelInfo({ model_key: 'aisha-video-a' }),
            makeAishaVideoModelInfo({ model_key: 'aisha-video-b' }),
          ],
        },
      ],
      user_context: null,
    };
    const actionDeps = deps([]);
    actionDeps.providers = providersMultiModel;
    const action = resolveLibraryAction(
      'use_as_first_frame',
      aishaAsset({ model: 'aisha-video-b' }),
      {},
      actionDeps,
    );
    await action?.();
    expect(get(generationStore).model).toBe('aisha-video-b');
  });

  it('falls back to another enabled role-capable model when the originating one cannot be used', async () => {
    const providersFallback: ProvidersResponse = {
      providers: [
        {
          provider: 'aisha',
          name: 'Aisha',
          available: true,
          provisioning_mode: 'always_on',
          models: [makeAishaVideoModelInfo({ model_key: 'aisha-video-b' })],
        },
      ],
      user_context: null,
    };
    const actionDeps = deps([]);
    actionDeps.providers = providersFallback;
    // Originating model 'aisha-video-a' no longer exists/enabled.
    const action = resolveLibraryAction(
      'use_as_first_frame',
      aishaAsset({ model: 'aisha-video-a' }),
      {},
      actionDeps,
    );
    await action?.();
    expect(get(generationStore).model).toBe('aisha-video-b');
  });

  it('does not navigate and surfaces an error toast when no role-capable model is enabled', async () => {
    const actionDeps = deps([]);
    actionDeps.providers = grokVideoOnlyProviders();
    const action = resolveLibraryAction('use_as_first_frame', aishaAsset(), {}, actionDeps);
    await action?.();
    expect(actionDeps.navigate).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalled();
    expect(get(generationStore).sourceMedia).toEqual([]);
  });
});

describe('Phase 4 — Animate role assignment follows the target contract, never a global rule', () => {
  it('assigns first_frame only when the resolved i2v target actually advertises that role', async () => {
    const actionDeps = deps([]);
    actionDeps.providers = aishaVideoProviders();
    actionDeps.loadDetail = vi
      .fn()
      .mockResolvedValue({ ...asset, model: 'aisha-video', media: makeMediaObject() });
    const action = resolveLibraryAction('animate', asset, {}, actionDeps);
    await action?.();
    expect(get(generationStore)).toMatchObject({
      model: 'aisha-video',
      mode: 'i2v',
      sourceMedia: [{ role: 'first_frame' }],
    });
  });

  it('keeps Animate roleless when the resolved i2v target advertises no roles', async () => {
    const actionDeps = deps([]);
    actionDeps.providers = grokVideoOnlyProviders(); // i2v with roles: null
    actionDeps.loadDetail = vi
      .fn()
      .mockResolvedValue({ ...asset, model: 'grok-imagine-video', media: makeMediaObject() });
    const action = resolveLibraryAction('animate', asset, {}, actionDeps);
    await action?.();
    expect(get(generationStore)).toMatchObject({
      mode: 'i2v',
      sourceMedia: [{ role: null }],
    });
  });
});
