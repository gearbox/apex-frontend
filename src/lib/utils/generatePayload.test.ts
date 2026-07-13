import { describe, it, expect } from 'vitest';
import { buildGeneratePayload } from './generatePayload';
import type { GenerationState } from '$lib/stores/generation';
import type { components } from '$lib/api/types';

type ModelInfo = components['schemas']['ModelInfo'];

const baseState: GenerationState = {
  provider: 'grok',
  model: 'grok-imagine-image',
  mode: 't2i',
  prompt: 'a cat',
  negativePrompt: 'blurry',
  uploadedImageId: null,
  sourceOutputId: null,
  selectedImagePreviewUrl: null,
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

const grokModelInfo: ModelInfo = {
  model_key: 'grok-imagine-image',
  name: 'Grok Imagine',
  description: '',
  capabilities: ['t2i'],
  is_enabled: true,
  max_images: 4,
  max_prompt_length: 4096,
  supports_negative_prompt: false,
  aspect_ratios: ['1:1'],
  requires_age_verification: false,
  image: null,
};

const aishaModelInfo: ModelInfo = {
  model_key: 'aisha-image',
  name: 'Aisha',
  description: '',
  capabilities: ['t2i'],
  is_enabled: true,
  max_images: 4,
  max_prompt_length: 4096,
  supports_negative_prompt: true,
  aspect_ratios: ['1:1'],
  requires_age_verification: false,
  image: {
    min_height: 256,
    max_height: 2048,
    default_height: 1024,
    output_resolutions: null,
    supported_tiers: ['draft', 'standard', 'high', 'ultra'],
    default_tier: 'standard',
    tier_megapixels: { draft: 0.25, standard: 1.0, high: 2.0, ultra: 4.0 },
  },
};

describe('buildGeneratePayload — Grok model', () => {
  it('always includes prompt, model, generation_type, aspect_ratio, n, duration', () => {
    const payload = buildGeneratePayload(baseState, grokModelInfo);
    expect(payload.prompt).toBe('a cat');
    expect(payload.model).toBe('grok-imagine-image');
    expect(payload.generation_type).toBe('t2i');
    expect(payload.aspect_ratio).toBe('1:1');
    expect(payload.n).toBe(1);
    expect(payload.duration).toBe(5);
  });

  it('never includes negative_prompt when model does not support it', () => {
    const payload = buildGeneratePayload(baseState, grokModelInfo);
    expect(payload.negative_prompt).toBeUndefined();
  });

  it('never includes Aisha params even when store has them set', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'grok-imagine-image',
      imageTier: 'high',
      seed: 42,
      steps: 30,
      sampler: 'euler',
    };
    const payload = buildGeneratePayload(state, grokModelInfo);
    expect(payload.image_resolution).toBeUndefined();
    expect(payload.width).toBeUndefined();
    expect(payload.height).toBeUndefined();
    expect(payload.seed).toBeUndefined();
    expect(payload.steps).toBeUndefined();
    expect(payload.sampler).toBeUndefined();
  });

  it('includes input_image_id when set', () => {
    const state: GenerationState = { ...baseState, uploadedImageId: 'img_001' };
    const payload = buildGeneratePayload(state, grokModelInfo);
    expect(payload.input_image_id).toBe('img_001');
    expect(payload.source_output_id).toBeUndefined();
  });

  it('includes source_output_id when set', () => {
    const state: GenerationState = { ...baseState, sourceOutputId: 'out_001' };
    const payload = buildGeneratePayload(state, grokModelInfo);
    expect(payload.source_output_id).toBe('out_001');
    expect(payload.input_image_id).toBeUndefined();
  });
});

describe('buildGeneratePayload — Aisha model negative_prompt', () => {
  it('includes negative_prompt when model supports it and value is non-empty', () => {
    const payload = buildGeneratePayload({ ...baseState, model: 'aisha-image' }, aishaModelInfo);
    expect(payload.negative_prompt).toBe('blurry');
  });

  it('includes the default negative_prompt (non-empty string)', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      negativePrompt: 'waxy texture, blurry face',
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.negative_prompt).toBe('waxy texture, blurry face');
  });

  it('trims negative_prompt before sending', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      negativePrompt: '  blurry  ',
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.negative_prompt).toBe('blurry');
  });

  it('omits negative_prompt when value is blank/whitespace', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      negativePrompt: '   ',
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.negative_prompt).toBeUndefined();
  });

  it('omits negative_prompt when empty string', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      negativePrompt: '',
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.negative_prompt).toBeUndefined();
  });
});

describe('buildGeneratePayload — Aisha image sizing', () => {
  it('tier mode with imageTier set → image_resolution present, no width/height', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      sizingMode: 'tier',
      imageTier: 'high',
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.image_resolution).toBe('high');
    expect(payload.width).toBeUndefined();
    expect(payload.height).toBeUndefined();
  });

  it('tier mode with null imageTier → no sizing fields (model default)', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      sizingMode: 'tier',
      imageTier: null,
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.image_resolution).toBeUndefined();
    expect(payload.width).toBeUndefined();
    expect(payload.height).toBeUndefined();
  });

  it('custom mode with both dims → width+height present, no image_resolution', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      sizingMode: 'custom',
      customWidth: 1024,
      customHeight: 768,
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.width).toBe(1024);
    expect(payload.height).toBe(768);
    expect(payload.image_resolution).toBeUndefined();
  });

  it('custom mode with only width → neither sizing field (half-pair omitted)', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      sizingMode: 'custom',
      customWidth: 1024,
      customHeight: null,
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.width).toBeUndefined();
    expect(payload.height).toBeUndefined();
    expect(payload.image_resolution).toBeUndefined();
  });

  it('custom mode with only height → neither sizing field (half-pair omitted)', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      sizingMode: 'custom',
      customWidth: null,
      customHeight: 768,
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.width).toBeUndefined();
    expect(payload.height).toBeUndefined();
    expect(payload.image_resolution).toBeUndefined();
  });

  it('custom mode with both null → no sizing fields', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      sizingMode: 'custom',
      customWidth: null,
      customHeight: null,
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.width).toBeUndefined();
    expect(payload.height).toBeUndefined();
    expect(payload.image_resolution).toBeUndefined();
  });
});

describe('buildGeneratePayload — Aisha sampler overrides', () => {
  it('includes only non-null sampler fields', () => {
    const state: GenerationState = {
      ...baseState,
      model: 'aisha-image',
      seed: 42,
      steps: 30,
      cfg: null,
      sampler: 'euler',
      scheduler: null,
      denoise: 0.8,
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.seed).toBe(42);
    expect(payload.steps).toBe(30);
    expect(payload.cfg).toBeUndefined();
    expect(payload.sampler).toBe('euler');
    expect(payload.scheduler).toBeUndefined();
    expect(payload.denoise).toBe(0.8);
  });

  it('omits all sampler fields when all are null', () => {
    const state: GenerationState = { ...baseState, model: 'aisha-image' };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.seed).toBeUndefined();
    expect(payload.steps).toBeUndefined();
    expect(payload.cfg).toBeUndefined();
    expect(payload.sampler).toBeUndefined();
    expect(payload.scheduler).toBeUndefined();
    expect(payload.denoise).toBeUndefined();
  });
});

describe('buildGeneratePayload — i2i aspect_ratio serialization', () => {
  it('i2i + editAspectRatio: null → aspect_ratio key absent from payload', () => {
    const state: GenerationState = {
      ...baseState,
      mode: 'i2i',
      aspectRatio: '3:4',
      editAspectRatio: null,
      sourceOutputId: 'out_001',
    };
    const payload = buildGeneratePayload(state, grokModelInfo);
    expect(payload).not.toHaveProperty('aspect_ratio');
  });

  it('i2i + editAspectRatio: "16:9" → sent as 16:9', () => {
    const state: GenerationState = {
      ...baseState,
      mode: 'i2i',
      aspectRatio: '3:4',
      editAspectRatio: '16:9',
      sourceOutputId: 'out_001',
    };
    const payload = buildGeneratePayload(state, aishaModelInfo);
    expect(payload.aspect_ratio).toBe('16:9');
  });

  it('t2i still sends state.aspectRatio regardless of editAspectRatio (regression)', () => {
    const state: GenerationState = {
      ...baseState,
      mode: 't2i',
      aspectRatio: '1:1',
      editAspectRatio: '16:9',
    };
    const payload = buildGeneratePayload(state, grokModelInfo);
    expect(payload.aspect_ratio).toBe('1:1');
  });

  it('t2v still sends state.aspectRatio, unaffected by editAspectRatio (regression)', () => {
    const state: GenerationState = {
      ...baseState,
      mode: 't2v',
      aspectRatio: '16:9',
      editAspectRatio: '1:1',
    };
    const payload = buildGeneratePayload(state, grokModelInfo);
    expect(payload.aspect_ratio).toBe('16:9');
  });

  it('i2v still sends state.aspectRatio, unaffected by editAspectRatio (regression)', () => {
    const state: GenerationState = {
      ...baseState,
      mode: 'i2v',
      aspectRatio: '9:16',
      editAspectRatio: '1:1',
      uploadedImageId: 'img_001',
    };
    const payload = buildGeneratePayload(state, grokModelInfo);
    expect(payload.aspect_ratio).toBe('9:16');
  });
});

describe('buildGeneratePayload — null modelInfo', () => {
  it('omits negative_prompt and Aisha params when modelInfo is null', () => {
    const state: GenerationState = {
      ...baseState,
      negativePrompt: 'blurry',
      imageTier: 'high',
      seed: 42,
    };
    const payload = buildGeneratePayload(state, null);
    expect(payload.negative_prompt).toBeUndefined();
    expect(payload.image_resolution).toBeUndefined();
    expect(payload.seed).toBeUndefined();
  });
});
