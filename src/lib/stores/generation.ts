import { writable, derived, get } from 'svelte/store';
import type { components } from '$lib/api/types';

export type GenerationMode = 't2i' | 'i2i' | 't2v' | 'i2v' | 'v2v' | 'flf2v';
type ModelType = components['schemas']['ModelType'];
type AspectRatio = components['schemas']['AspectRatio'];
type JobStatus = components['schemas']['JobStatus'];
type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];

export interface GenerationState {
  // Model
  provider: 'grok';
  model: ModelType;
  mode: GenerationMode;

  // Inputs
  prompt: string;
  negativePrompt: string;
  uploadedImageId: string | null;

  // Parameters
  aspectRatio: AspectRatio;
  imageCount: number;
  videoDuration: number;
  videoResolution: '480p' | '720p';

  // Session job tracking
  activeJobId: string | null;
  jobStatus: JobStatus | null;
  completedJob: UnifiedJobResponse | null;
  progress: number | null; // 0–100, null when not tracking
}

const DEFAULT_NEGATIVE_PROMPT =
  'waxy texture, blurry face, over-sharpening, unrealistic symmetry, flat lighting, low detail skin, extra fingers, distorted anatomy, deformed';

function createGenerationStore() {
  const initial: GenerationState = {
    provider: 'grok',
    model: 'grok-imagine-image',
    mode: 't2i',
    prompt: '',
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    uploadedImageId: null,
    aspectRatio: '3:4',
    imageCount: 1,
    videoDuration: 5,
    videoResolution: '720p',
    activeJobId: null,
    jobStatus: null,
    completedJob: null,
    progress: null,
  };

  const { subscribe, update, set } = writable<GenerationState>(initial);

  return {
    subscribe,

    setModel(model: ModelType) {
      update((s) => ({ ...s, model, activeJobId: null, jobStatus: null, completedJob: null }));
    },

    setMode(mode: GenerationMode) {
      update((s) => ({ ...s, mode, activeJobId: null, jobStatus: null, completedJob: null }));
    },

    setPrompt(prompt: string) {
      update((s) => ({ ...s, prompt }));
    },

    setNegativePrompt(negativePrompt: string) {
      update((s) => ({ ...s, negativePrompt }));
    },

    setUploadedImageId(id: string | null) {
      update((s) => ({ ...s, uploadedImageId: id }));
    },

    setAspectRatio(aspectRatio: AspectRatio) {
      update((s) => ({ ...s, aspectRatio }));
    },

    setImageCount(imageCount: number) {
      update((s) => ({ ...s, imageCount: Math.max(1, Math.min(4, imageCount)) }));
    },

    setVideoDuration(videoDuration: number) {
      update((s) => ({ ...s, videoDuration: Math.max(1, Math.min(15, videoDuration)) }));
    },

    setVideoResolution(videoResolution: '480p' | '720p') {
      update((s) => ({ ...s, videoResolution }));
    },

    startJob(jobId: string) {
      update((s) => ({ ...s, activeJobId: jobId, jobStatus: 'pending', completedJob: null, progress: null }));
    },

    setStatus(status: JobStatus) {
      update((s) => ({ ...s, jobStatus: status }));
    },

    setProgress(pct: number) {
      update((s) => ({ ...s, progress: Math.min(100, Math.max(0, pct)) }));
    },

    setComplete(job: UnifiedJobResponse) {
      update((s) => ({
        ...s,
        jobStatus: 'completed',
        completedJob: job,
        progress: 100,
      }));
    },

    setError() {
      update((s) => ({ ...s, jobStatus: 'failed', activeJobId: null, progress: null }));
    },

    prefill(params: Partial<GenerationState>) {
      update((s) => ({ ...s, ...params, activeJobId: null, jobStatus: null, completedJob: null }));
    },

    reset() {
      set(initial);
    },
  };
}

export const generationStore = createGenerationStore();

export const isGenerating = derived(
  generationStore,
  ($s) => $s.jobStatus !== null && $s.jobStatus !== 'completed' && $s.jobStatus !== 'failed' && $s.jobStatus !== 'cancelled' && $s.jobStatus !== 'moderated',
);

export const canGenerate = derived(
  generationStore,
  ($s) => $s.prompt.trim().length > 0 && !get(isGenerating),
);
