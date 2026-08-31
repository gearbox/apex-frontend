import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  generationDraftFingerprint,
  generationStore,
  markGenerationDraftSaved,
  generationDraftIsDirty,
  type SourceMediaDraft,
} from './generation';

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

beforeEach(() => generationStore.reset());

describe('generationStore source media', () => {
  it('appends only unique canonical asset refs and preserves order', () => {
    generationStore.appendSourceMedia(upload);
    generationStore.appendSourceMedia(output);
    generationStore.appendSourceMedia(upload);
    expect(get(generationStore).sourceMedia.map((source) => source.assetRef)).toEqual([
      upload.assetRef,
      output.assetRef,
    ]);
  });

  it('replaces and removes positions without changing the remaining order', () => {
    const third = { ...upload, assetRef: 'upload:33333333-3333-3333-3333-333333333333' };
    generationStore.setSourceMedia([upload, output, third]);
    generationStore.replaceSourceMedia(1, { ...output, available: false });
    expect(get(generationStore).sourceMedia[1].available).toBe(false);
    generationStore.removeSourceMedia(1);
    expect(get(generationStore).sourceMedia.map((source) => source.assetRef)).toEqual([
      upload.assetRef,
      third.assetRef,
    ]);
  });

  it('does not replace a position with a duplicate ref', () => {
    generationStore.setSourceMedia([upload, output]);
    generationStore.replaceSourceMedia(1, upload);
    expect(get(generationStore).sourceMedia).toEqual([upload, output]);
  });

  it('prefill keeps explicitly ordered sources and otherwise clears an old selection', () => {
    generationStore.setSourceMedia([upload]);
    generationStore.setInputVideoUrl('/v1/content/outputs/old-video');
    generationStore.prefill({ prompt: 'new draft' });
    expect(get(generationStore).sourceMedia).toEqual([]);
    expect(get(generationStore).inputVideoUrl).toBeNull();

    generationStore.prefill({ sourceMedia: [output, upload] });
    expect(get(generationStore).sourceMedia.map((source) => source.assetRef)).toEqual([
      output.assetRef,
      upload.assetRef,
    ]);
  });

  it('normalizes duplicate prefill refs without changing the first source position', () => {
    generationStore.prefill({ sourceMedia: [output, upload, output] });
    expect(get(generationStore).sourceMedia.map((source) => source.assetRef)).toEqual([
      output.assetRef,
      upload.assetRef,
    ]);
  });

  it('includes source identity and availability, but not preview URLs, in the draft fingerprint', () => {
    const before = get(generationStore);
    const fingerprint = generationDraftFingerprint({ ...before, sourceMedia: [upload] });
    expect(fingerprint).toContain(upload.assetRef);
    expect(fingerprint).not.toContain(upload.previewUrl!);
    expect(
      generationDraftFingerprint({ ...before, sourceMedia: [{ ...upload, available: false }] }),
    ).not.toBe(fingerprint);
  });

  it('marks source-media prefill as dirty until the accepted request is saved', () => {
    generationStore.prefill({ sourceMedia: [upload] });
    expect(get(generationDraftIsDirty)).toBe(true);
    markGenerationDraftSaved();
    expect(get(generationDraftIsDirty)).toBe(false);
  });
});

describe('generationStore draft hygiene', () => {
  it('ignores job-tracking updates in the dirty baseline but tracks later draft edits', () => {
    markGenerationDraftSaved();
    generationStore.startJob('job-1');
    generationStore.setProgress(50);
    generationStore.setError();
    expect(get(generationDraftIsDirty)).toBe(false);
    generationStore.setPrompt('edited after submission');
    expect(get(generationDraftIsDirty)).toBe(true);
  });

  it('does not overwrite a non-nullable field when a prefill explicitly passes undefined', () => {
    generationStore.setNegativePrompt('keep me');
    generationStore.prefill({ negativePrompt: undefined });
    expect(get(generationStore).negativePrompt).toBe('keep me');
  });

  it('resets edit aspect ratio on model and mode transitions unless a prefill explicitly provides it', () => {
    generationStore.setEditAspectRatio('16:9');
    generationStore.setMode('i2i');
    expect(get(generationStore).editAspectRatio).toBeNull();
    generationStore.setEditAspectRatio('16:9');
    generationStore.setModel('grok-2-image-1212');
    expect(get(generationStore).editAspectRatio).toBeNull();
    generationStore.prefill({ editAspectRatio: '1:1' });
    expect(get(generationStore).editAspectRatio).toBe('1:1');
  });

  it('clamps custom dimensions and writable parameter ranges', () => {
    generationStore.setCustomSize(1, 9_999);
    generationStore.setSteps(0);
    generationStore.setCfg(99);
    generationStore.setDenoise(-1);
    expect(get(generationStore)).toMatchObject({
      customWidth: 256,
      customHeight: 4096,
      steps: 1,
      cfg: 30,
      denoise: 0,
    });
  });

  it('clears workflow parameter overrides when the model changes', () => {
    generationStore.setImageTier('high');
    generationStore.setCustomSize(1024, 768);
    generationStore.setSeed(42);
    generationStore.setSampler('euler');
    generationStore.setModel('grok-2-image-1212');
    expect(get(generationStore)).toMatchObject({
      imageTier: null,
      customWidth: null,
      customHeight: null,
      seed: null,
      sampler: null,
    });
  });
});
