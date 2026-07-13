import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { generationStore } from './generation';

beforeEach(() => {
  generationStore.reset();
});

describe('generationStore — image source mutual exclusion', () => {
  it('setUploadedImageId clears sourceOutputId', () => {
    generationStore.setSourceOutputId('output_001', '/v1/content/outputs/output_001');
    expect(get(generationStore).sourceOutputId).toBe('output_001');

    generationStore.setUploadedImageId('upload_001');
    expect(get(generationStore).uploadedImageId).toBe('upload_001');
    expect(get(generationStore).sourceOutputId).toBeNull();
  });

  it('setSourceOutputId clears uploadedImageId', () => {
    generationStore.setUploadedImageId('upload_001');
    expect(get(generationStore).uploadedImageId).toBe('upload_001');

    generationStore.setSourceOutputId('output_001', '/v1/content/outputs/output_001');
    expect(get(generationStore).sourceOutputId).toBe('output_001');
    expect(get(generationStore).uploadedImageId).toBeNull();
  });

  it('clearing one does not restore the other', () => {
    generationStore.setSourceOutputId('output_001', '/v1/content/outputs/output_001');
    generationStore.setSourceOutputId(null);
    expect(get(generationStore).sourceOutputId).toBeNull();
    expect(get(generationStore).uploadedImageId).toBeNull();
  });

  it('setSourceOutputId stores previewUrl', () => {
    generationStore.setSourceOutputId('output_001', '/v1/content/outputs/output_001');
    expect(get(generationStore).selectedImagePreviewUrl).toBe('/v1/content/outputs/output_001');
  });

  it('setUploadedImageId clears selectedImagePreviewUrl', () => {
    generationStore.setSourceOutputId('output_001', '/v1/content/outputs/output_001');
    generationStore.setUploadedImageId('upload_001');
    expect(get(generationStore).selectedImagePreviewUrl).toBeNull();
  });

  it('clearing sourceOutputId also clears selectedImagePreviewUrl', () => {
    generationStore.setSourceOutputId('output_001', '/v1/content/outputs/output_001');
    generationStore.setSourceOutputId(null);
    expect(get(generationStore).selectedImagePreviewUrl).toBeNull();
  });
});

describe('generationStore — prefill', () => {
  it('resets image source fields when not provided in params', () => {
    generationStore.setSourceOutputId('output_001', '/v1/content/outputs/output_001');
    generationStore.prefill({ prompt: 'a cat' });
    const state = get(generationStore);
    expect(state.prompt).toBe('a cat');
    expect(state.sourceOutputId).toBeNull();
    expect(state.uploadedImageId).toBeNull();
    expect(state.selectedImagePreviewUrl).toBeNull();
  });

  it('preserves sourceOutputId when explicitly passed in params', () => {
    generationStore.prefill({ prompt: 'a cat', sourceOutputId: 'output_002' });
    const state = get(generationStore);
    expect(state.prompt).toBe('a cat');
    expect(state.sourceOutputId).toBe('output_002');
  });
});

describe('generationStore — remix flow', () => {
  it('prefill then setSourceOutputId simulates Lightbox remix', () => {
    // Simulate: Lightbox calls prefill (resets images), then setSourceOutputId
    generationStore.prefill({
      prompt: 'remix prompt',
      mode: 'i2i',
    });

    let state = get(generationStore);
    expect(state.prompt).toBe('remix prompt');
    expect(state.mode).toBe('i2i');
    expect(state.sourceOutputId).toBeNull(); // prefill cleared it

    generationStore.setSourceOutputId('out_001', '/v1/content/outputs/out_001');

    state = get(generationStore);
    expect(state.sourceOutputId).toBe('out_001');
    expect(state.selectedImagePreviewUrl).toBe('/v1/content/outputs/out_001');
    expect(state.uploadedImageId).toBeNull();
    expect(state.prompt).toBe('remix prompt'); // prompt preserved
    expect(state.mode).toBe('i2i'); // mode preserved
  });

  it('setMode + setSourceOutputId simulates ResultsPanel use-as-input', () => {
    generationStore.setMode('i2i');
    generationStore.setSourceOutputId('out_002', '/v1/content/outputs/out_002');

    const state = get(generationStore);
    expect(state.mode).toBe('i2i');
    expect(state.sourceOutputId).toBe('out_002');
    expect(state.selectedImagePreviewUrl).toBe('/v1/content/outputs/out_002');
    expect(state.uploadedImageId).toBeNull();
  });
});

describe('generationStore — editAspectRatio hygiene', () => {
  it('defaults to null (Auto)', () => {
    expect(get(generationStore).editAspectRatio).toBeNull();
  });

  it('setEditAspectRatio sets and clears the value', () => {
    generationStore.setEditAspectRatio('16:9');
    expect(get(generationStore).editAspectRatio).toBe('16:9');
    generationStore.setEditAspectRatio(null);
    expect(get(generationStore).editAspectRatio).toBeNull();
  });

  it('setMode resets editAspectRatio to null', () => {
    generationStore.setEditAspectRatio('16:9');
    generationStore.setMode('i2i');
    expect(get(generationStore).editAspectRatio).toBeNull();
  });

  it('setModel resets editAspectRatio to null', () => {
    generationStore.setEditAspectRatio('16:9');
    generationStore.setModel('aisha-image');
    expect(get(generationStore).editAspectRatio).toBeNull();
  });

  it('prefill resets editAspectRatio to null unless explicitly passed', () => {
    generationStore.setEditAspectRatio('16:9');
    generationStore.prefill({ prompt: 'remix' });
    expect(get(generationStore).editAspectRatio).toBeNull();
  });

  it('prefill preserves editAspectRatio when explicitly passed', () => {
    generationStore.prefill({ prompt: 'remix', editAspectRatio: '4:3' });
    expect(get(generationStore).editAspectRatio).toBe('4:3');
  });

  it('a t2i aspect selection cannot leak into i2i editAspectRatio on mode switch', () => {
    generationStore.setAspectRatio('9:16');
    generationStore.setMode('i2i');
    expect(get(generationStore).editAspectRatio).toBeNull();
    expect(get(generationStore).aspectRatio).toBe('9:16');
  });
});

describe('generationStore — Aisha image param setters', () => {
  it('setSizingMode toggles between tier and custom', () => {
    generationStore.setSizingMode('custom');
    expect(get(generationStore).sizingMode).toBe('custom');
    generationStore.setSizingMode('tier');
    expect(get(generationStore).sizingMode).toBe('tier');
  });

  it('setImageTier sets and clears imageTier', () => {
    generationStore.setImageTier('high');
    expect(get(generationStore).imageTier).toBe('high');
    generationStore.setImageTier(null);
    expect(get(generationStore).imageTier).toBeNull();
  });

  it('setCustomSize clamps width and height to default 256–4096', () => {
    generationStore.setCustomSize(100, 5000);
    const state = get(generationStore);
    expect(state.customWidth).toBe(256);
    expect(state.customHeight).toBe(4096);
  });

  it('setCustomSize clamps to model-supplied minDim/maxDim', () => {
    generationStore.setCustomSize(4000, 100, 256, 2048);
    const state = get(generationStore);
    expect(state.customWidth).toBe(2048);
    expect(state.customHeight).toBe(256);
  });

  it('setCustomSize stores null for NaN input', () => {
    generationStore.setCustomSize(NaN, NaN);
    const state = get(generationStore);
    expect(state.customWidth).toBeNull();
    expect(state.customHeight).toBeNull();
  });

  it('setCustomSize allows null for either dimension', () => {
    generationStore.setCustomSize(1024, null);
    const state = get(generationStore);
    expect(state.customWidth).toBe(1024);
    expect(state.customHeight).toBeNull();
  });

  it('setSeed stores null for NaN', () => {
    generationStore.setSeed(NaN);
    expect(get(generationStore).seed).toBeNull();
  });

  it('setSteps stores null for NaN', () => {
    generationStore.setSteps(NaN);
    expect(get(generationStore).steps).toBeNull();
  });

  it('setCfg stores null for NaN', () => {
    generationStore.setCfg(NaN);
    expect(get(generationStore).cfg).toBeNull();
  });

  it('setDenoise stores null for NaN', () => {
    generationStore.setDenoise(NaN);
    expect(get(generationStore).denoise).toBeNull();
  });

  it('setSteps clamps to 1–150', () => {
    generationStore.setSteps(0);
    expect(get(generationStore).steps).toBe(1);
    generationStore.setSteps(200);
    expect(get(generationStore).steps).toBe(150);
    generationStore.setSteps(50);
    expect(get(generationStore).steps).toBe(50);
    generationStore.setSteps(null);
    expect(get(generationStore).steps).toBeNull();
  });

  it('setCfg clamps to 0–30', () => {
    generationStore.setCfg(-1);
    expect(get(generationStore).cfg).toBe(0);
    generationStore.setCfg(35);
    expect(get(generationStore).cfg).toBe(30);
    generationStore.setCfg(7.5);
    expect(get(generationStore).cfg).toBe(7.5);
    generationStore.setCfg(null);
    expect(get(generationStore).cfg).toBeNull();
  });

  it('setDenoise clamps to 0–1', () => {
    generationStore.setDenoise(-0.5);
    expect(get(generationStore).denoise).toBe(0);
    generationStore.setDenoise(1.5);
    expect(get(generationStore).denoise).toBe(1);
    generationStore.setDenoise(0.75);
    expect(get(generationStore).denoise).toBe(0.75);
    generationStore.setDenoise(null);
    expect(get(generationStore).denoise).toBeNull();
  });

  it('setSampler and setScheduler set and clear values', () => {
    generationStore.setSampler('euler');
    expect(get(generationStore).sampler).toBe('euler');
    generationStore.setSampler(null);
    expect(get(generationStore).sampler).toBeNull();

    generationStore.setScheduler('karras');
    expect(get(generationStore).scheduler).toBe('karras');
    generationStore.setScheduler(null);
    expect(get(generationStore).scheduler).toBeNull();
  });

  it('reset() clears all Aisha params back to initial values', () => {
    generationStore.setSizingMode('custom');
    generationStore.setCustomSize(1024, 768);
    generationStore.setImageTier('ultra');
    generationStore.setSteps(50);
    generationStore.setCfg(7);
    generationStore.setSampler('euler');
    generationStore.setScheduler('karras');
    generationStore.setDenoise(0.8);
    generationStore.setSeed(42);

    generationStore.reset();
    const state = get(generationStore);
    expect(state.sizingMode).toBe('tier');
    expect(state.imageTier).toBeNull();
    expect(state.customWidth).toBeNull();
    expect(state.customHeight).toBeNull();
    expect(state.seed).toBeNull();
    expect(state.steps).toBeNull();
    expect(state.cfg).toBeNull();
    expect(state.sampler).toBeNull();
    expect(state.scheduler).toBeNull();
    expect(state.denoise).toBeNull();
  });

  it('setModel() clears all Aisha params', () => {
    generationStore.setSizingMode('custom');
    generationStore.setCustomSize(512, 512);
    generationStore.setSteps(40);
    generationStore.setSampler('heun');

    generationStore.setModel('grok-imagine-image');
    const state = get(generationStore);
    expect(state.sizingMode).toBe('tier');
    expect(state.customWidth).toBeNull();
    expect(state.customHeight).toBeNull();
    expect(state.steps).toBeNull();
    expect(state.sampler).toBeNull();
  });
});
