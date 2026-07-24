import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  filterVisibleLibraryActions,
  resolveLibraryAction,
  aspectRatioPrefill,
  ACTION_MODE,
  type LibraryAction,
  type LibraryUiAction,
  type LibraryActionAsset,
  type LibraryActionDeps,
} from './actions';
import { SaveActivationError } from '$lib/media/save';
import { addToast } from '$lib/stores/toasts';
import { generationStore } from '$lib/stores/generation';
import type { GenerationMode } from '$lib/utils/generationModes';
import { ROUTES } from '$lib/utils/routes';
import {
  makeLibraryAssetItem,
  makeLibraryAssetDetail,
  makeLibraryLineage,
} from '../../../mocks/factories/library';
import { makeMediaObject } from '../../../mocks/factories/media';
import { makeGrokImageModelInfo } from '../../../mocks/factories/providers';
import type { components } from '$lib/api/types';

type ProvidersResponse = components['schemas']['ProvidersResponse'];

const { saveMediaMock } = vi.hoisted(() => ({
  saveMediaMock: vi.fn(),
}));

vi.mock('$lib/media/save', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/media/save')>();
  return {
    ...actual,
    saveMedia: saveMediaMock,
  };
});

vi.mock('$lib/stores/toasts', () => ({
  addToast: vi.fn(),
}));

const OUTPUT_UUID = '323e4567-e89b-12d3-a456-426614174000';
const SOURCE_UUID = '223e4567-e89b-12d3-a456-426614174000';

const ALL_MODES: ReadonlySet<GenerationMode> = new Set([
  't2i',
  'i2i',
  't2v',
  'i2v',
  'v2v',
  'flf2v',
]);
const IMAGE_ONLY_MODES: ReadonlySet<GenerationMode> = new Set(['t2i', 'i2i']);
const NO_MODES: ReadonlySet<GenerationMode> = new Set();

/** grok-imagine-image (t2i/i2i) + grok-imagine-video (t2v/i2v/v2v), both enabled — no flf2v. */
function makeProviders(overrides: Partial<ProvidersResponse> = {}): ProvidersResponse {
  return {
    providers: [
      {
        provider: 'grok',
        name: 'xAI Grok',
        available: true,
        provisioning_mode: 'always_on',
        models: [
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-image',
            is_enabled: true,
            capabilities: ['t2i', 'i2i'],
          }),
          makeGrokImageModelInfo({
            model_key: 'grok-imagine-video',
            is_enabled: true,
            capabilities: ['t2v', 'i2v', 'v2v'],
            image: null,
          }),
        ],
      },
    ],
    user_context: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<LibraryActionDeps> = {}): LibraryActionDeps {
  return {
    providers: makeProviders(),
    loadDetail: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
}

describe('filterVisibleLibraryActions', () => {
  it('always removes create_variation, even when its mode (i2i) is available', () => {
    const actions: LibraryAction[] = ['remix', 'create_variation', 'favorite'];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: ALL_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['remix', 'favorite']);
  });

  it('removes first/last-frame actions when no enabled model supports flf2v', () => {
    const actions: LibraryAction[] = [
      'remix',
      'use_as_first_frame',
      'use_as_last_frame',
      'favorite',
    ];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: IMAGE_ONLY_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['remix', 'favorite']);
  });

  it('keeps first/last-frame actions when an enabled model supports flf2v', () => {
    const actions: LibraryAction[] = [
      'remix',
      'use_as_first_frame',
      'use_as_last_frame',
      'favorite',
    ];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: ALL_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['remix', 'use_as_first_frame', 'use_as_last_frame', 'favorite']);
  });

  it('hides remix/animate/extend when their target modes are unavailable', () => {
    const actions: LibraryAction[] = ['remix', 'animate', 'extend', 'favorite'];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: NO_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['favorite']);
  });

  it('does not gate actions with no ACTION_MODE entry on availableModes', () => {
    const actions: LibraryAction[] = ['reproduce', 'view_settings', 'extract_frame'];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: NO_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual(actions);
  });

  it('preserves the relative order of the remaining actions', () => {
    const actions: LibraryAction[] = [
      'favorite',
      'create_variation',
      'remix',
      'use_as_first_frame',
      'download',
      'delete',
    ];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: IMAGE_ONLY_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['favorite', 'remix', 'download', 'delete']);
  });

  it('is a no-op for an already-clean action list', () => {
    const actions: LibraryAction[] = ['remix', 'favorite', 'download', 'delete'];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: IMAGE_ONLY_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual(actions);
  });

  it("expands download to ['share', 'download'] under an injected mobile capability set", () => {
    const actions: LibraryAction[] = ['favorite', 'download', 'delete'];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: ALL_MODES,
        saveCapabilities: ['share', 'download'],
      }),
    ).toEqual(['favorite', 'share', 'download', 'delete']);
  });

  it("expands download to ['download'] only under an injected desktop capability set", () => {
    const actions: LibraryAction[] = ['favorite', 'download', 'delete'];
    expect(
      filterVisibleLibraryActions(actions, {
        availableModes: ALL_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual(['favorite', 'download', 'delete']);
  });
});

describe('resolveLibraryAction — share/download', () => {
  const asset: LibraryActionAsset = {
    asset_ref: `output:${OUTPUT_UUID}`,
    media: makeMediaObject(),
  };

  beforeEach(() => {
    saveMediaMock.mockReset();
    vi.mocked(addToast).mockClear();
  });

  it('produces no toast when the outcome is cancelled', async () => {
    saveMediaMock.mockResolvedValue('cancelled');
    await resolveLibraryAction('share', asset, {}, makeDeps())?.();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('shows the retry toast when share fails on expired activation', async () => {
    saveMediaMock.mockRejectedValue(new SaveActivationError());
    await resolveLibraryAction('share', asset, {}, makeDeps())?.();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  it('shows the generic error toast on any other save failure', async () => {
    saveMediaMock.mockRejectedValue(new Error('boom'));
    await resolveLibraryAction('download', asset, {}, makeDeps())?.();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});

describe('resolveLibraryAction — useAsSource (remix/animate/extend/etc.)', () => {
  beforeEach(() => {
    generationStore.reset();
    vi.mocked(addToast).mockClear();
  });

  it('remix resolves to i2i on the source model and sets the source image after prefill', () => {
    const asset: LibraryActionAsset = {
      asset_ref: `output:${OUTPUT_UUID}`,
      media: makeMediaObject(),
      model: 'grok-imagine-image',
      prompt: 'a cat astronaut',
    };
    const navigate = vi.fn();

    resolveLibraryAction('remix', asset, {}, makeDeps({ navigate }))?.();

    const state = get(generationStore);
    expect(state.mode).toBe('i2i');
    expect(state.model).toBe('grok-imagine-image');
    expect(state.prompt).toBe('a cat astronaut');
    expect(state.sourceOutputId).toBe(OUTPUT_UUID);
    expect(navigate).toHaveBeenCalledWith(ROUTES.create);
  });

  it('keeps negativePrompt a string when remixing a grid item with no negative_prompt', () => {
    const item = makeLibraryAssetItem({ asset_ref: `output:${OUTPUT_UUID}` });
    const navigate = vi.fn();
    generationStore.setNegativePrompt('no blur');

    resolveLibraryAction('remix', item, {}, makeDeps({ navigate }))?.();

    expect(get(generationStore).negativePrompt).toBe('no blur');
    expect(typeof get(generationStore).negativePrompt).toBe('string');
  });

  it('animate resolves a video-capable model when the source asset model is image-only', () => {
    const asset: LibraryActionAsset = {
      asset_ref: `output:${OUTPUT_UUID}`,
      media: makeMediaObject(),
      model: 'grok-imagine-image',
      prompt: 'a cat astronaut',
    };
    const navigate = vi.fn();

    resolveLibraryAction('animate', asset, {}, makeDeps({ navigate }))?.();

    const state = get(generationStore);
    expect(state.mode).toBe('i2v');
    expect(state.model).toBe('grok-imagine-video');
    expect(navigate).toHaveBeenCalledWith(ROUTES.create);
  });

  it('animate toasts and does not navigate when no enabled model supports i2v', () => {
    const imageOnlyProviders: ProvidersResponse = {
      providers: [
        {
          provider: 'grok',
          name: 'xAI Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [makeGrokImageModelInfo({ is_enabled: true, capabilities: ['t2i', 'i2i'] })],
        },
      ],
      user_context: null,
    };
    const asset: LibraryActionAsset = {
      asset_ref: `output:${OUTPUT_UUID}`,
      media: makeMediaObject(),
      model: 'grok-imagine-image',
    };
    const navigate = vi.fn();

    resolveLibraryAction(
      'animate',
      asset,
      {},
      makeDeps({ providers: imageOnlyProviders, navigate }),
    )?.();

    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(get(generationStore).mode).toBe('t2i'); // untouched — the initial default
  });

  it('is filtered out of the menu by filterVisibleLibraryActions when i2v is unavailable', () => {
    expect(
      filterVisibleLibraryActions(['animate'], {
        availableModes: IMAGE_ONLY_MODES,
        saveCapabilities: ['download'],
      }),
    ).toEqual([]);
  });

  it('use_as_first_frame/use_as_last_frame map to flf2v and are hidden when availableModes lacks it', () => {
    expect(ACTION_MODE.use_as_first_frame).toBe('flf2v');
    expect(ACTION_MODE.use_as_last_frame).toBe('flf2v');
    expect(
      filterVisibleLibraryActions(['use_as_first_frame', 'use_as_last_frame'], {
        availableModes: new Set(['t2i', 'i2i', 't2v', 'i2v', 'v2v']),
        saveCapabilities: ['download'],
      }),
    ).toEqual([]);
  });
});

describe('aspectRatioPrefill', () => {
  const editableModel = makeGrokImageModelInfo({
    model_key: 'grok-imagine-image',
    image: { edit_aspect_ratios: ['1:1', '16:9'] },
  });
  const providers: ProvidersResponse = {
    providers: [
      {
        provider: 'grok',
        name: 'xAI Grok',
        available: true,
        provisioning_mode: 'always_on',
        models: [editableModel],
      },
    ],
    user_context: null,
  };

  it('uses a validated editAspectRatio for i2i and aspectRatio for other modes', () => {
    expect(aspectRatioPrefill('16:9', 'i2i', 'grok-imagine-image', providers)).toEqual({
      editAspectRatio: '16:9',
    });
    expect(aspectRatioPrefill('16:9', 't2i', 'grok-imagine-image', providers)).toEqual({
      aspectRatio: '16:9',
    });
  });

  it('omits unsupported and unknown aspect ratios', () => {
    expect(aspectRatioPrefill('4:3', 'i2i', 'grok-imagine-image', providers)).toBeUndefined();
    expect(aspectRatioPrefill('21:9', 't2i', 'grok-imagine-image', providers)).toBeUndefined();
  });
});

describe('resolveLibraryAction — reproduce', () => {
  beforeEach(() => {
    generationStore.reset();
    vi.mocked(addToast).mockClear();
  });

  it('restores mode, source image, prompt, negative prompt, and a validated aspect ratio for an i2i asset', async () => {
    const editableModel = makeGrokImageModelInfo({
      model_key: 'grok-imagine-image',
      is_enabled: true,
      capabilities: ['t2i', 'i2i'],
      image: { edit_aspect_ratios: ['1:1', '16:9'] },
    });
    const providers: ProvidersResponse = {
      providers: [
        {
          provider: 'grok',
          name: 'xAI Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [editableModel],
        },
      ],
      user_context: null,
    };

    const detail = makeLibraryAssetDetail({
      asset_ref: `output:${OUTPUT_UUID}`,
      generation_type: 'i2i',
      model: 'grok-imagine-image',
      prompt: 'a cat astronaut',
      negative_prompt: 'blurry',
      aspect_ratio: '16:9',
      lineage: makeLibraryLineage({ source_asset_ref: `upload:${SOURCE_UUID}` }),
    });
    const sourceDetail = makeLibraryAssetDetail({
      asset_ref: `upload:${SOURCE_UUID}`,
      source: 'upload',
    });
    const loadDetail = vi.fn(async (ref: string) =>
      ref === detail.asset_ref ? detail : sourceDetail,
    );
    const navigate = vi.fn();

    await resolveLibraryAction('reproduce', detail, {}, { providers, loadDetail, navigate })?.();

    const state = get(generationStore);
    expect(state.mode).toBe('i2i');
    expect(state.model).toBe('grok-imagine-image');
    expect(state.prompt).toBe('a cat astronaut');
    expect(state.negativePrompt).toBe('blurry');
    expect(state.editAspectRatio).toBe('16:9');
    expect(state.uploadedImageId).toBe(SOURCE_UUID);
    expect(navigate).toHaveBeenCalledWith(ROUTES.create);
  });

  it('leaves editAspectRatio null when the resolved model cannot reshape to the stored aspect ratio', async () => {
    const nonEditableModel = makeGrokImageModelInfo({
      model_key: 'grok-imagine-image',
      is_enabled: true,
      capabilities: ['t2i', 'i2i'],
      image: { edit_aspect_ratios: [] },
    });
    const providers: ProvidersResponse = {
      providers: [
        {
          provider: 'grok',
          name: 'xAI Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [nonEditableModel],
        },
      ],
      user_context: null,
    };
    const detail = makeLibraryAssetDetail({
      asset_ref: `output:${OUTPUT_UUID}`,
      generation_type: 'i2i',
      aspect_ratio: '16:9',
      lineage: makeLibraryLineage({ source_asset_ref: `output:${SOURCE_UUID}` }),
    });
    const sourceDetail = makeLibraryAssetDetail({ asset_ref: `output:${SOURCE_UUID}` });
    const loadDetail = vi.fn(async (ref: string) =>
      ref === detail.asset_ref ? detail : sourceDetail,
    );

    await resolveLibraryAction(
      'reproduce',
      detail,
      {},
      { providers, loadDetail, navigate: vi.fn() },
    )?.();

    expect(get(generationStore).editAspectRatio).toBeNull();
  });

  it('shows an error toast naming the problem and does not navigate when lineage.source_asset_ref is missing', async () => {
    const detail = makeLibraryAssetDetail({
      asset_ref: `output:${OUTPUT_UUID}`,
      generation_type: 'i2i',
      lineage: null,
    });
    const loadDetail = vi.fn().mockResolvedValue(detail);
    const navigate = vi.fn();
    const before = get(generationStore);

    await resolveLibraryAction(
      'reproduce',
      detail,
      {},
      { providers: makeProviders(), loadDetail, navigate },
    )?.();

    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(get(generationStore)).toEqual(before);
  });

  it('shows an error toast and does not navigate when the source detail fetch rejects (404)', async () => {
    const detail = makeLibraryAssetDetail({
      asset_ref: `output:${OUTPUT_UUID}`,
      generation_type: 'i2i',
      lineage: makeLibraryLineage({ source_asset_ref: `upload:${SOURCE_UUID}` }),
    });
    const loadDetail = vi.fn((ref: string) =>
      ref === detail.asset_ref ? Promise.resolve(detail) : Promise.reject(new Error('404')),
    );
    const navigate = vi.fn();
    const before = get(generationStore);

    await resolveLibraryAction(
      'reproduce',
      detail,
      {},
      { providers: makeProviders(), loadDetail, navigate },
    )?.();

    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(get(generationStore)).toEqual(before);
  });

  it('shows the no-model toast and does not navigate when nothing supports the target mode', async () => {
    const detail = makeLibraryAssetDetail({
      asset_ref: `output:${OUTPUT_UUID}`,
      generation_type: 'flf2v',
    });
    const loadDetail = vi.fn().mockResolvedValue(detail);
    const navigate = vi.fn();

    await resolveLibraryAction(
      'reproduce',
      detail,
      {},
      { providers: makeProviders(), loadDetail, navigate },
    )?.();

    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('restores the prompt via the detail fetch even when invoked from a LibraryAssetItem (no prompt field)', async () => {
    const item = makeLibraryAssetItem({
      asset_ref: `output:${OUTPUT_UUID}`,
      generation_type: 't2i',
    });
    expect('prompt' in item).toBe(false);

    const detail = makeLibraryAssetDetail({
      asset_ref: `output:${OUTPUT_UUID}`,
      generation_type: 't2i',
      prompt: 'a lighthouse at dusk',
    });
    const loadDetail = vi.fn().mockResolvedValue(detail);
    const navigate = vi.fn();

    await resolveLibraryAction(
      'reproduce',
      item,
      {},
      { providers: makeProviders(), loadDetail, navigate },
    )?.();

    expect(get(generationStore).prompt).toBe('a lighthouse at dusk');
    expect(get(generationStore).mode).toBe('t2i');
    expect(navigate).toHaveBeenCalledWith(ROUTES.create);
  });

  it('never rejects, even when the primary detail fetch throws', async () => {
    const item = makeLibraryAssetItem({ asset_ref: `output:${OUTPUT_UUID}` });
    const loadDetail = vi.fn().mockRejectedValue(new Error('network'));
    const navigate = vi.fn();

    await expect(
      resolveLibraryAction(
        'reproduce',
        item,
        {},
        { providers: makeProviders(), loadDetail, navigate },
      )?.(),
    ).resolves.toBeUndefined();

    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('resolveLibraryAction — no handler ever rejects', () => {
  beforeEach(() => {
    generationStore.reset();
    vi.mocked(addToast).mockClear();
    saveMediaMock.mockRejectedValue(new Error('boom'));
  });

  it('resolves cleanly for every navigation/save action given failing dependencies', async () => {
    const detail = makeLibraryAssetDetail({ asset_ref: `output:${OUTPUT_UUID}` });
    const failingDeps: LibraryActionDeps = {
      providers: undefined,
      loadDetail: vi.fn().mockRejectedValue(new Error('network')),
      navigate: vi.fn(),
    };
    const actions: LibraryUiAction[] = [
      'share',
      'download',
      'remix',
      'animate',
      'extend',
      'use_as_reference',
      'use_as_first_frame',
      'use_as_last_frame',
      'reproduce',
    ];

    for (const action of actions) {
      const handler = resolveLibraryAction(action, detail, {}, failingDeps);
      expect(handler).not.toBeNull();
      await expect(Promise.resolve(handler!())).resolves.toBeUndefined();
    }
  });
});
