import { describe, expect, it } from 'vitest';
import { resolveEffectiveGenerationMode } from './generationModeResolverAdapter';
import {
  makeGrokImageModelInfo,
  makeGrokVideoModelInfo,
  makeAishaVideoModelInfo,
  generationModes,
} from '../../mocks/factories/providers';
import type { GenerationState, SourceMediaDraft } from '$lib/stores/generation';

const baseState: GenerationState = {
  model: 'grok-imagine-image',
  mode: 't2i',
  prompt: 'a cat',
  negativePrompt: '',
  sourceMedia: [],
  aspectRatio: '1:1',
  editAspectRatio: null,
  imageCount: 1,
  videoDuration: 5,
  videoResolution: '720p',
  sizingMode: 'tier',
  imageTier: null,
  customWidth: null,
  customHeight: null,
  seed: null,
  steps: null,
  cfg: null,
  sampler: null,
  scheduler: null,
  denoise: null,
  activeJobId: null,
  jobStatus: null,
  completedJob: null,
  progress: null,
};

const image: SourceMediaDraft = {
  assetRef: 'upload:11111111-1111-1111-1111-111111111111',
  mediaType: 'image',
  previewUrl: '/upload.png',
  label: 'upload',
  available: true,
};

const image2: SourceMediaDraft = {
  assetRef: 'upload:22222222-2222-2222-2222-222222222222',
  mediaType: 'image',
  previewUrl: '/upload2.png',
  label: 'upload',
  available: true,
};

const video: SourceMediaDraft = {
  assetRef: 'upload:33333333-3333-3333-3333-333333333333',
  mediaType: 'video',
  previewUrl: '/upload.mp4',
  label: 'upload',
  available: true,
};

describe('resolveEffectiveGenerationMode — Phase-2 TypeSelector compatibility boundary', () => {
  it('resolves t2i normally when no source is present', () => {
    const modelInfo = makeGrokImageModelInfo();
    const result = resolveEffectiveGenerationMode({ ...baseState, mode: 't2i' }, modelInfo);
    expect(result).toMatchObject({ status: 'resolved', mode: 't2i' });
  });

  it('hides a leftover I2I source from the resolver once the user explicitly switches back to T2I', () => {
    const modelInfo = makeGrokImageModelInfo(); // t2i: source_media null
    const state: GenerationState = { ...baseState, mode: 't2i', sourceMedia: [image] };

    const result = resolveEffectiveGenerationMode(state, modelInfo);

    // Legacy UX: t2i does not consume media, so the stored source is invisible
    // to the resolver and t2i resolves cleanly instead of becoming ambiguous
    // with i2i (which the leftover source would otherwise also satisfy).
    expect(result).toMatchObject({ status: 'resolved', mode: 't2i' });
    // No data destruction: the store's source list itself is untouched.
    expect(state.sourceMedia).toEqual([image]);
  });

  it('does not hide the source when the explicitly selected mode actually accepts it', () => {
    const modelInfo = makeGrokImageModelInfo();
    const state: GenerationState = { ...baseState, mode: 'i2i', sourceMedia: [image] };

    expect(resolveEffectiveGenerationMode(state, modelInfo)).toMatchObject({
      status: 'resolved',
      mode: 'i2i',
    });
  });

  it('keeps an explicit incomplete Type selection usable while sources are still empty', () => {
    const modelInfo = makeGrokVideoModelInfo();
    const state: GenerationState = { ...baseState, model: 'grok-imagine-video', mode: 'v2v' };

    expect(resolveEffectiveGenerationMode(state, modelInfo)).toMatchObject({
      status: 'incomplete',
      mode: 'v2v',
    });
  });

  it('recomputes independently after a model switch, without touching the stored draft', () => {
    const state: GenerationState = { ...baseState, mode: 'i2i', sourceMedia: [image] };

    const withImageModel = resolveEffectiveGenerationMode(state, makeGrokImageModelInfo());
    expect(withImageModel).toMatchObject({ status: 'resolved', mode: 'i2i' });

    // Switch to a model that still advertises "i2i" but whose contract cannot
    // accept an image for it: the same stored draft now fails to resolve
    // instead of being silently repaired to fit.
    const incompatibleModel = makeGrokImageModelInfo({
      generation_modes: generationModes(['t2i', 'i2i'], {
        i2i: { min: 1, max: 1, media_types: ['video'], roles: null },
      }),
    });
    const withIncompatibleModel = resolveEffectiveGenerationMode(state, incompatibleModel);
    expect(withIncompatibleModel.status).toBe('invalid');
    expect(state.sourceMedia).toEqual([image]);
  });
});

describe('resolveEffectiveGenerationMode — explicit Type must never be cross-substituted (P1)', () => {
  it('Grok V2V source -> explicit I2V: fails closed instead of silently submitting v2v', () => {
    const modelInfo = makeGrokVideoModelInfo();
    const state: GenerationState = {
      ...baseState,
      model: 'grok-imagine-video',
      mode: 'i2v',
      sourceMedia: [video],
    };

    const result = resolveEffectiveGenerationMode(state, modelInfo);

    expect(result.status).toBe('invalid');
    // No hidden fallback: must not resolve the video-compatible v2v candidate
    // behind the still-displayed I2V selection.
    if (result.status === 'resolved' || result.status === 'incomplete') {
      expect(result.mode).not.toBe('v2v');
    }
    expect(state.sourceMedia).toEqual([video]);
  });

  it('reverse mismatch: explicit V2V + retained image does not silently resolve I2V', () => {
    const modelInfo = makeGrokVideoModelInfo();
    const state: GenerationState = {
      ...baseState,
      model: 'grok-imagine-video',
      mode: 'v2v',
      sourceMedia: [image],
    };

    const result = resolveEffectiveGenerationMode(state, modelInfo);

    expect(result.status).toBe('invalid');
    expect(state.sourceMedia).toEqual([image]);
  });

  it('Aisha FLF2V -> explicit I2V: two retained images do not silently resolve flf2v', () => {
    const modelInfo = makeAishaVideoModelInfo();
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-video',
      mode: 'i2v',
      sourceMedia: [image, image2],
    };

    const result = resolveEffectiveGenerationMode(state, modelInfo);

    expect(result.status).toBe('invalid');
    if (result.status === 'resolved' || result.status === 'incomplete') {
      expect(result.mode).not.toBe('flf2v');
    }
    expect(state.sourceMedia).toEqual([image, image2]);
  });

  it('recovers once the source draft matches the explicit Type again', () => {
    const modelInfo = makeGrokVideoModelInfo();
    const state: GenerationState = {
      ...baseState,
      model: 'grok-imagine-video',
      mode: 'i2v',
      sourceMedia: [image],
    };

    expect(resolveEffectiveGenerationMode(state, modelInfo)).toMatchObject({
      status: 'resolved',
      mode: 'i2v',
    });
  });

  it('unsupported/stale selected Type after a model switch fails closed rather than auto-falling-back', () => {
    // grok-imagine-image does not advertise i2v at all — simulates the
    // transient where the store still holds a mode the newly selected
    // model's TypeSelector has not yet reconciled away from.
    const modelInfo = makeGrokImageModelInfo();
    const state: GenerationState = { ...baseState, mode: 'i2v', sourceMedia: [] };

    const result = resolveEffectiveGenerationMode(state, modelInfo);

    expect(result.status).toBe('invalid');
  });
});
