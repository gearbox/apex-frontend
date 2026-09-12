import { describe, expect, it } from 'vitest';
import {
  buildGeneratePayload,
  sourceMediaCountForRequest,
  outputCountForRequest,
  sourceMediaForRequest,
  validateSourceMedia,
  projectSourceMedia,
} from './generatePayload';
import type { GenerationState, SourceMediaDraft } from '$lib/stores/generation';
import {
  makeAishaVideoModelInfo,
  makeGrokImageModelInfo,
  generationModes,
} from '../../mocks/factories/providers';

const upload: SourceMediaDraft = {
  assetRef: 'upload:11111111-1111-1111-1111-111111111111',
  mediaType: 'image',
  previewUrl: '/upload.png',
  label: 'upload',
  available: true,
  role: null,
};
const output: SourceMediaDraft = {
  assetRef: 'output:22222222-2222-2222-2222-222222222222',
  mediaType: 'image',
  previewUrl: '/output.png',
  label: 'output',
  available: true,
  role: null,
};
const video: SourceMediaDraft = {
  assetRef: 'upload:33333333-3333-3333-3333-333333333333',
  mediaType: 'video',
  previewUrl: '/video.png',
  label: 'video',
  available: true,
  role: null,
};

const baseState: GenerationState = {
  model: 'grok-imagine-image',
  mode: 't2i',
  prompt: 'a cat',
  negativePrompt: 'blurry',
  sourceMedia: [],
  aspectRatio: '1:1',
  editAspectRatio: null,
  imageCount: 3,
  videoDuration: 5,
  videoResolution: '720p',
  sizingMode: 'tier',
  imageTier: 'high',
  customWidth: null,
  customHeight: null,
  seed: 42,
  steps: 30,
  cfg: 7,
  sampler: 'euler',
  scheduler: 'karras',
  denoise: 0.8,
  activeJobId: null,
  jobStatus: null,
  completedJob: null,
  progress: null,
};

function model(overrides: Parameters<typeof makeGrokImageModelInfo>[0] = {}) {
  return makeGrokImageModelInfo({
    max_images: 4,
    unsupported_parameters: [],
    generation_modes: generationModes(['t2i', 'i2i', 'v2v'], {
      i2i: { min: 1, max: 3, media_types: ['image'], roles: null },
      v2v: { min: 1, max: 1, media_types: ['video'], roles: null },
    }),
    ...overrides,
  });
}

describe('canonical source_media payload projection', () => {
  it('serializes ordered upload/output asset refs and never emits deprecated aliases', () => {
    const payload = buildGeneratePayload(
      { ...baseState, mode: 'i2i', sourceMedia: [output, upload] },
      model(),
    );

    expect(payload.source_media).toEqual([
      { asset_ref: 'output:22222222-2222-2222-2222-222222222222' },
      { asset_ref: 'upload:11111111-1111-1111-1111-111111111111' },
    ]);
    expect(payload).not.toHaveProperty('input_image_id');
    expect(payload).not.toHaveProperty('source_output_id');
    expect(payload).not.toHaveProperty('source_images');
    expect(payload).not.toHaveProperty('input_video_url');
  });

  it('omits source_media for an empty draft when the latest model declares source_media null', () => {
    const noSourceModel = model({
      generation_modes: generationModes(['t2i', 'i2i'], { i2i: null }),
    });
    const state = { ...baseState, mode: 'i2i' as const, sourceMedia: [] };
    const payload = buildGeneratePayload(state, noSourceModel);

    expect(payload.source_media).toBeUndefined();
    expect(validateSourceMedia(state, noSourceModel)).toEqual({
      valid: true,
      message: null,
    });
  });

  it('rejects a retained generic source for a source-free mode instead of dropping it', () => {
    const noSourceModel = model({
      generation_modes: generationModes(['t2i', 'i2i'], { i2i: null }),
    });
    const state = { ...baseState, mode: 'i2i' as const, sourceMedia: [upload] };

    expect(validateSourceMedia(state, noSourceModel).valid).toBe(false);
    expect(projectSourceMedia(state, noSourceModel)).toMatchObject({ valid: false });
    expect(() => sourceMediaForRequest(state, noSourceModel)).toThrow();
    expect(sourceMediaCountForRequest(state, noSourceModel)).toBeNull();
    expect(() => buildGeneratePayload(state, noSourceModel)).toThrow();
  });

  it('rejects a retained role source for a source-free mode', () => {
    const noSourceModel = model({
      generation_modes: generationModes(['t2i', 'i2i'], { i2i: null }),
    });
    const state = {
      ...baseState,
      mode: 'i2i' as const,
      sourceMedia: [{ ...upload, role: 'first_frame' as const }],
    };

    expect(validateSourceMedia(state, noSourceModel).valid).toBe(false);
  });

  it('treats an over-capacity draft as invalid instead of truncating it into a smaller request', () => {
    const third = { ...upload, assetRef: 'upload:third' };
    const state = { ...baseState, mode: 't2i' as const, sourceMedia: [upload, output, third] };
    const current = model({
      generation_modes: generationModes(['t2i'], {
        t2i: { min: 1, max: 2, media_types: ['image'], roles: null },
      }),
    });

    expect(validateSourceMedia(state, current).valid).toBe(false);
    expect(projectSourceMedia(state, current)).toMatchObject({ valid: false });
    expect(() => sourceMediaForRequest(state, current)).toThrow();
    expect(sourceMediaCountForRequest(state, current)).toBeNull();
  });

  it('treats an incompatible-kind draft as invalid instead of silently filtering it out', () => {
    const audio: SourceMediaDraft = { ...upload, assetRef: 'upload:audio', mediaType: 'audio' };
    const state = { ...baseState, mode: 't2i' as const, sourceMedia: [upload, audio] };
    const current = model({
      generation_modes: generationModes(['t2i'], {
        t2i: { min: 1, max: 2, media_types: ['image'], roles: null },
      }),
    });

    expect(validateSourceMedia(state, current).valid).toBe(false);
    expect(projectSourceMedia(state, current)).toMatchObject({ valid: false });
    expect(() => sourceMediaForRequest(state, current)).toThrow();
    expect(sourceMediaCountForRequest(state, current)).toBeNull();
  });

  it('treats an unavailable replay source as invalid instead of silently dropping it', () => {
    const unavailable: SourceMediaDraft = { ...upload, available: false };
    const state = { ...baseState, mode: 'i2i' as const, sourceMedia: [unavailable] };

    expect(validateSourceMedia(state, model()).valid).toBe(false);
    expect(projectSourceMedia(state, model())).toMatchObject({ valid: false });
    expect(() => sourceMediaForRequest(state, model())).toThrow();
    expect(sourceMediaCountForRequest(state, model())).toBeNull();
  });
});

describe('pricing and request source-count agreement', () => {
  it('agrees pricing and submitted source counts for a valid draft', () => {
    const state = { ...baseState, mode: 'i2i' as const, sourceMedia: [upload, output] };
    expect(sourceMediaCountForRequest(state, model())).toBe(
      sourceMediaForRequest(state, model())?.length,
    );
    expect(sourceMediaCountForRequest(state, model())).toBe(
      buildGeneratePayload(state, model()).source_media?.length,
    );
  });

  it('suppresses the quote (does not price a repaired subset) for an invalid draft', () => {
    const third = { ...upload, assetRef: 'upload:third' };
    const overCapacity = {
      ...baseState,
      mode: 't2i' as const,
      sourceMedia: [upload, output, third],
    };
    const current = model({
      generation_modes: generationModes(['t2i'], {
        t2i: { min: 1, max: 2, media_types: ['image'], roles: null },
      }),
    });
    expect(validateSourceMedia(overCapacity, current).valid).toBe(false);
    expect(sourceMediaCountForRequest(overCapacity, current)).toBeNull();
  });
});

describe('source_media requiredness', () => {
  it('treats an accepted mode as optional when its own min is 0', () => {
    const optionalT2i = model({
      generation_modes: generationModes(['t2i'], {
        t2i: { min: 0, max: 2, media_types: ['image'], roles: null },
      }),
    });
    const state = { ...baseState, mode: 't2i' as const };
    expect(validateSourceMedia(state, optionalT2i)).toEqual({
      valid: true,
      message: null,
    });
    expect(buildGeneratePayload(state, optionalT2i).source_media).toBeUndefined();
  });

  it('requires min only for i2i in this provider response', () => {
    expect(validateSourceMedia({ ...baseState, mode: 'i2i' }, model()).valid).toBe(false);
    expect(
      validateSourceMedia({ ...baseState, mode: 'i2i', sourceMedia: [upload] }, model()),
    ).toEqual({
      valid: true,
      message: null,
    });
  });

  it('makes a future mode required solely from its own min > 0', () => {
    const futureModel = model({
      generation_modes: generationModes(['t2i', 'future-edit'], {
        t2i: null,
        'future-edit': { min: 1, max: 2, media_types: ['image'], roles: null },
      }),
    });
    expect(validateSourceMedia({ ...baseState, mode: 'future-edit' }, futureModel).valid).toBe(
      false,
    );
    expect(
      validateSourceMedia({ ...baseState, mode: 'future-edit', sourceMedia: [upload] }, futureModel)
        .valid,
    ).toBe(true);
  });

  it('sends its video source through source_media like every other source-driven mode', () => {
    const state = { ...baseState, mode: 'v2v' as const, sourceMedia: [video] };
    const payload = buildGeneratePayload(state, model());
    expect(payload.source_media).toEqual([{ asset_ref: video.assetRef }]);
    expect(payload).not.toHaveProperty('input_video_url');
    expect(validateSourceMedia(state, model()).valid).toBe(true);
    expect(validateSourceMedia({ ...baseState, mode: 'v2v' }, model()).valid).toBe(false);
  });

  it('treats duplicate source refs as invalid instead of silently deduplicating them', () => {
    const state = { ...baseState, mode: 'i2i' as const, sourceMedia: [upload, upload] };
    expect(validateSourceMedia(state, model()).valid).toBe(false);
    expect(projectSourceMedia(state, model())).toMatchObject({ valid: false });
    expect(() => sourceMediaForRequest(state, model())).toThrow();
    expect(sourceMediaCountForRequest(state, model())).toBeNull();
  });

  it('keeps validation and serialized source counts aligned for valid drafts', () => {
    const state = { ...baseState, mode: 'i2i' as const, sourceMedia: [upload, output] };
    expect(validateSourceMedia(state, model()).valid).toBe(true);
    expect(sourceMediaForRequest(state, model())).toHaveLength(state.sourceMedia.length);
  });
});

describe('unsupported parameter projection', () => {
  it('omits every stale unsupported parameter and forces n=1 without batch_size', () => {
    const payload = buildGeneratePayload(
      baseState,
      model({
        unsupported_parameters: [
          'aspect_ratio',
          'batch_size',
          'cfg',
          'denoise',
          'height',
          'image_resolution',
          'negative_prompt',
          'sampler',
          'scheduler',
          'seed',
          'steps',
          'width',
        ],
      }),
    );
    expect(payload.n).toBe(1);
    for (const key of [
      'aspect_ratio',
      'negative_prompt',
      'image_resolution',
      'width',
      'height',
      'seed',
      'steps',
      'cfg',
      'sampler',
      'scheduler',
      'denoise',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('uses max_images only when batch_size is currently supported', () => {
    expect(outputCountForRequest(baseState, model({ max_images: 2 }))).toBe(2);
    expect(
      outputCountForRequest(
        baseState,
        model({ max_images: 10, unsupported_parameters: ['batch_size'] }),
      ),
    ).toBe(1);
  });
});

describe('general payload normalization regressions', () => {
  it('always keeps the common request fields and normalizes the output count', () => {
    const payload = buildGeneratePayload(baseState, model({ max_images: 2 }));
    expect(payload).toMatchObject({
      prompt: 'a cat',
      model: 'grok-imagine-image',
      generation_type: 't2i',
      aspect_ratio: '1:1',
      n: 2,
    });
  });

  it('trims a supported negative prompt and omits blank values', () => {
    const supportsNegative = model({ supports_negative_prompt: true });
    expect(
      buildGeneratePayload({ ...baseState, negativePrompt: '  crisp  ' }, supportsNegative),
    ).toMatchObject({ negative_prompt: 'crisp' });
    expect(
      buildGeneratePayload({ ...baseState, negativePrompt: '   ' }, supportsNegative),
    ).not.toHaveProperty('negative_prompt');
  });

  it('projects tier and custom sizing mutually exclusively', () => {
    expect(buildGeneratePayload(baseState, model())).toMatchObject({ image_resolution: 'high' });
    expect(buildGeneratePayload(baseState, model())).not.toHaveProperty('width');
    const custom = buildGeneratePayload(
      {
        ...baseState,
        sizingMode: 'custom',
        customWidth: 1024,
        customHeight: 768,
      },
      model(),
    );
    expect(custom).toMatchObject({ width: 1024, height: 768 });
    expect(custom).not.toHaveProperty('image_resolution');
  });

  it('omits an incomplete custom sizing pair', () => {
    const payload = buildGeneratePayload(
      { ...baseState, sizingMode: 'custom', customWidth: 1024, customHeight: null },
      model(),
    );
    expect(payload).not.toHaveProperty('width');
    expect(payload).not.toHaveProperty('height');
  });

  it('uses edit aspect ratio only for i2i and leaves Auto absent', () => {
    expect(
      buildGeneratePayload(
        { ...baseState, mode: 'i2i', sourceMedia: [upload], editAspectRatio: null },
        model(),
      ),
    ).not.toHaveProperty('aspect_ratio');
    expect(
      buildGeneratePayload(
        { ...baseState, mode: 'i2i', sourceMedia: [upload], editAspectRatio: '16:9' },
        model(),
      ),
    ).toMatchObject({ aspect_ratio: '16:9' });
    expect(
      buildGeneratePayload({ ...baseState, mode: 't2v', editAspectRatio: '16:9' }, model()),
    ).toMatchObject({ aspect_ratio: '1:1' });
  });
});

describe('positional role projection (Phase 4)', () => {
  const firstFrame: SourceMediaDraft = { ...upload, role: 'first_frame' };
  const lastFrame: SourceMediaDraft = { ...output, role: 'last_frame' };

  it('reorders a store draft entered out of contract order into the advertised role order', () => {
    // Store order is last_frame then first_frame — the wire request must
    // still be [first_frame, last_frame] per the advertised roles array.
    const state = { ...baseState, mode: 'flf2v' as const, sourceMedia: [lastFrame, firstFrame] };
    const flf2vModel = makeAishaVideoModelInfo();
    expect(projectSourceMedia(state, flf2vModel)).toMatchObject({
      valid: true,
      sourceMedia: [{ asset_ref: firstFrame.assetRef }, { asset_ref: lastFrame.assetRef }],
    });
    expect(buildGeneratePayload(state, flf2vModel).source_media).toEqual([
      { asset_ref: firstFrame.assetRef },
      { asset_ref: lastFrame.assetRef },
    ]);
  });

  it('never leaks a role field into the wire payload', () => {
    const state = { ...baseState, mode: 'flf2v' as const, sourceMedia: [firstFrame, lastFrame] };
    const payload = buildGeneratePayload(state, makeAishaVideoModelInfo());
    for (const item of payload.source_media ?? []) {
      expect(item).not.toHaveProperty('role');
      expect(Object.keys(item)).toEqual(['asset_ref']);
    }
  });

  it('preserves roleless insertion order exactly (no positional reordering for roles: null)', () => {
    const state = { ...baseState, mode: 'i2i' as const, sourceMedia: [output, upload] };
    expect(projectSourceMedia(state, model())).toMatchObject({
      valid: true,
      sourceMedia: [{ asset_ref: output.assetRef }, { asset_ref: upload.assetRef }],
    });
  });

  it('rejects a named-role source for a roleless contract instead of erasing its semantic assignment', () => {
    const state = { ...baseState, mode: 'i2i' as const, sourceMedia: [firstFrame] };

    expect(validateSourceMedia(state, model())).toEqual({
      valid: false,
      message: 'This source is assigned to a role this model does not support.',
    });
    expect(projectSourceMedia(state, model())).toMatchObject({ valid: false });
    expect(() => sourceMediaForRequest(state, model())).toThrow();
    expect(() => buildGeneratePayload(state, model())).toThrow();
  });

  it('rejects a generic source for a positional contract', () => {
    const state = { ...baseState, mode: 'flf2v' as const, sourceMedia: [upload, output] };

    expect(validateSourceMedia(state, makeAishaVideoModelInfo()).valid).toBe(false);
    expect(projectSourceMedia(state, makeAishaVideoModelInfo())).toMatchObject({ valid: false });
  });

  it('rejects a draft missing a required role instead of sending a partial list', () => {
    const state = { ...baseState, mode: 'flf2v' as const, sourceMedia: [firstFrame] };
    const flf2vModel = makeAishaVideoModelInfo();
    expect(validateSourceMedia(state, flf2vModel).valid).toBe(false);
    expect(projectSourceMedia(state, flf2vModel)).toMatchObject({ valid: false });
    expect(() => sourceMediaForRequest(state, flf2vModel)).toThrow();
  });

  it('rejects a duplicate role assignment', () => {
    const state = {
      ...baseState,
      mode: 'flf2v' as const,
      sourceMedia: [firstFrame, { ...output, role: 'first_frame' as const }],
    };
    expect(validateSourceMedia(state, makeAishaVideoModelInfo()).valid).toBe(false);
  });

  it('rejects a source whose role this model contract does not advertise', () => {
    const state = {
      ...baseState,
      mode: 'flf2v' as const,
      sourceMedia: [firstFrame, { ...output, role: 'reference' as const }],
    };
    expect(validateSourceMedia(state, makeAishaVideoModelInfo()).valid).toBe(false);
  });

  it('rejects an unrecognized/future role name rather than guessing its media kind', () => {
    const state = {
      ...baseState,
      mode: 'flf2v' as const,
      sourceMedia: [firstFrame, { ...output, role: 'middle_frame' as never }],
    };
    expect(validateSourceMedia(state, makeAishaVideoModelInfo()).valid).toBe(false);
  });

  it('rejects an unavailable role-tagged source instead of silently replaying a shorter list', () => {
    const state = {
      ...baseState,
      mode: 'flf2v' as const,
      sourceMedia: [firstFrame, { ...lastFrame, available: false }],
    };
    const flf2vModel = makeAishaVideoModelInfo();
    expect(validateSourceMedia(state, flf2vModel)).toMatchObject({ valid: false });
    expect(projectSourceMedia(state, flf2vModel)).toMatchObject({ valid: false });
  });

  it('never sends input_video_url for v2v, with or without roles', () => {
    const videoSource: SourceMediaDraft = { ...video, role: null };
    const state = { ...baseState, mode: 'v2v' as const, sourceMedia: [videoSource] };
    expect(buildGeneratePayload(state, model())).not.toHaveProperty('input_video_url');
  });
});
