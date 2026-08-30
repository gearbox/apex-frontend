import { describe, expect, it } from 'vitest';
import {
  buildGeneratePayload,
  inputImageCountForRequest,
  outputCountForRequest,
  sourceMediaForRequest,
  validateSourceMedia,
} from './generatePayload';
import type { GenerationState, SourceMediaDraft } from '$lib/stores/generation';
import { makeGrokImageModelInfo } from '../../mocks/factories/providers';

const upload: SourceMediaDraft = {
  assetRef: 'upload:11111111-1111-1111-1111-111111111111',
  mediaType: 'image',
  previewUrl: '/upload.png',
  label: 'upload',
  available: true,
};
const output: SourceMediaDraft = {
  assetRef: 'output:22222222-2222-2222-2222-222222222222',
  mediaType: 'image',
  previewUrl: '/output.png',
  label: 'output',
  available: true,
};

const baseState: GenerationState = {
  provider: 'grok',
  model: 'grok-imagine-image',
  mode: 't2i',
  prompt: 'a cat',
  negativePrompt: 'blurry',
  sourceMedia: [],
  inputVideoUrl: null,
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
    inputs: {
      source_media: {
        min: 1,
        max: 3,
        media_types: ['image'],
        required_for: ['i2i'],
      },
    },
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
  });

  it('omits owned media entirely when the latest model declares source_media null', () => {
    const payload = buildGeneratePayload(
      { ...baseState, mode: 'i2i', sourceMedia: [upload] },
      model({ inputs: { source_media: null } }),
    );
    expect(payload.source_media).toBeUndefined();
    expect(
      validateSourceMedia(
        { ...baseState, mode: 'i2i', sourceMedia: [upload] },
        model({ inputs: { source_media: null } }),
      ),
    ).toEqual({
      valid: true,
      message: null,
    });
  });

  it('filters stale unsupported kinds and current max before pricing or POST projection', () => {
    const audio: SourceMediaDraft = { ...upload, assetRef: 'upload:audio', mediaType: 'audio' };
    const third = { ...upload, assetRef: 'upload:third' };
    const fourth = { ...upload, assetRef: 'upload:fourth' };
    const state = { ...baseState, sourceMedia: [upload, audio, output, third, fourth] };
    const current = model({
      inputs: { source_media: { min: 1, max: 2, media_types: ['image'], required_for: [] } },
    });

    expect(sourceMediaForRequest(state, current)).toEqual([
      { asset_ref: upload.assetRef },
      { asset_ref: output.assetRef },
    ]);
    expect(inputImageCountForRequest(state, current)).toBe(2);
    expect(validateSourceMedia(state, current).valid).toBe(false);
  });
});

describe('source_media required_for', () => {
  it('does not treat min as required outside required_for', () => {
    const state = { ...baseState, mode: 't2i' as const };
    expect(validateSourceMedia(state, model())).toEqual({
      valid: true,
      message: null,
    });
    expect(buildGeneratePayload(state, model()).source_media).toBeUndefined();
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

  it('makes a future mode required solely from required_for', () => {
    const futureModel = model({
      capabilities: ['t2i', 'future-edit'],
      inputs: {
        source_media: { min: 1, max: 2, media_types: ['image'], required_for: ['future-edit'] },
      },
    });
    expect(validateSourceMedia({ ...baseState, mode: 'future-edit' }, futureModel).valid).toBe(
      false,
    );
    expect(
      validateSourceMedia({ ...baseState, mode: 'future-edit', sourceMedia: [upload] }, futureModel)
        .valid,
    ).toBe(true);
  });

  it('keeps v2v on input_video_url and out of source_media validation', () => {
    const payload = buildGeneratePayload(
      { ...baseState, mode: 'v2v', inputVideoUrl: '/v1/content/outputs/video' },
      model(),
    );
    expect(payload.input_video_url).toBe('/v1/content/outputs/video');
    expect(payload.source_media).toBeUndefined();
    expect(validateSourceMedia({ ...baseState, mode: 'v2v' }, model()).valid).toBe(true);
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
