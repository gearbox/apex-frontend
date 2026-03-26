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
