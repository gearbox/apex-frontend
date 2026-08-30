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

  it('replaces, removes, and reorders positions without changing refs', () => {
    const third = { ...upload, assetRef: 'upload:33333333-3333-3333-3333-333333333333' };
    generationStore.setSourceMedia([upload, output, third]);
    generationStore.replaceSourceMedia(1, { ...output, available: false });
    generationStore.reorderSourceMedia(2, 0);
    generationStore.removeSourceMedia(1);
    expect(get(generationStore).sourceMedia.map((source) => source.assetRef)).toEqual([
      third.assetRef,
      output.assetRef,
    ]);
    expect(get(generationStore).sourceMedia[1].available).toBe(false);
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
