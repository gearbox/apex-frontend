import { writable, derived, get } from 'svelte/store';
import type { components } from '$lib/api/types';

export type GenerationMode = 't2i' | 'i2i' | 't2v' | 'i2v' | 'v2v' | 'flf2v';
type ModelType = components['schemas']['ModelType'];
type AspectRatio = components['schemas']['AspectRatio'];
type JobStatus = components['schemas']['JobStatus'];
type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];
type Resolution = components['schemas']['Resolution'];
type Sampler = components['schemas']['Sampler'];
type Scheduler = components['schemas']['Scheduler'];

export interface GenerationState {
  // Model
  provider: 'grok';
  model: ModelType;
  mode: GenerationMode;

  // Inputs
  prompt: string;
  negativePrompt: string;
  uploadedImageId: string | null; // from file upload → maps to input_image_id
  sourceOutputId: string | null; // from gallery picker → maps to source_output_id
  selectedImagePreviewUrl: string | null; // content proxy URL for picker preview display

  // Parameters
  aspectRatio: AspectRatio; // t2i / video default aspect
  editAspectRatio: AspectRatio | null; // i2i aspect; null = Auto (match source)
  imageCount: number;
  videoDuration: number;
  videoResolution: '480p' | '720p';

  // Aisha image sizing (image_resolution XOR width+height)
  sizingMode: 'tier' | 'custom';
  imageTier: Resolution | null;
  customWidth: number | null;
  customHeight: number | null;

  // Aisha sampler overrides (null = Auto / use model bundle default)
  seed: number | null;
  steps: number | null;
  cfg: number | null;
  sampler: Sampler | null;
  scheduler: Scheduler | null;
  denoise: number | null;

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
    sourceOutputId: null,
    selectedImagePreviewUrl: null,
    aspectRatio: '3:4',
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

  const { subscribe, update, set } = writable<GenerationState>(initial);

  return {
    subscribe,

    setModel(model: ModelType) {
      update((s) => ({
        ...s,
        model,
        activeJobId: null,
        jobStatus: null,
        completedJob: null,
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
        editAspectRatio: null,
      }));
    },

    setMode(mode: GenerationMode) {
      update((s) => ({
        ...s,
        mode,
        activeJobId: null,
        jobStatus: null,
        completedJob: null,
        editAspectRatio: null,
      }));
    },

    setPrompt(prompt: string) {
      update((s) => ({ ...s, prompt }));
    },

    setNegativePrompt(negativePrompt: string) {
      update((s) => ({ ...s, negativePrompt }));
    },

    setUploadedImageId(id: string | null, previewUrl: string | null = null) {
      update((s) => ({
        ...s,
        uploadedImageId: id,
        // Clear sourceOutputId — mutually exclusive
        sourceOutputId: id ? null : s.sourceOutputId,
        selectedImagePreviewUrl: id ? previewUrl : null,
      }));
    },

    setSourceOutputId(id: string | null, previewUrl: string | null = null) {
      update((s) => ({
        ...s,
        sourceOutputId: id,
        // Clear uploadedImageId — mutually exclusive
        uploadedImageId: id ? null : s.uploadedImageId,
        selectedImagePreviewUrl: id ? previewUrl : null,
      }));
    },

    setAspectRatio(aspectRatio: AspectRatio) {
      update((s) => ({ ...s, aspectRatio }));
    },

    setEditAspectRatio(editAspectRatio: AspectRatio | null) {
      update((s) => ({ ...s, editAspectRatio }));
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

    setSizingMode(sizingMode: 'tier' | 'custom') {
      update((s) => ({ ...s, sizingMode }));
    },

    setImageTier(imageTier: Resolution | null) {
      update((s) => ({ ...s, imageTier }));
    },

    setCustomSize(
      customWidth: number | null,
      customHeight: number | null,
      minDim = 256,
      maxDim = 4096,
    ) {
      const clamp = (v: number | null): number | null =>
        v === null || Number.isNaN(v) ? null : Math.max(minDim, Math.min(maxDim, v));
      update((s) => ({ ...s, customWidth: clamp(customWidth), customHeight: clamp(customHeight) }));
    },

    setSeed(seed: number | null) {
      update((s) => ({ ...s, seed: seed !== null && Number.isNaN(seed) ? null : seed }));
    },

    setSteps(steps: number | null) {
      update((s) => ({
        ...s,
        steps: steps === null || Number.isNaN(steps) ? null : Math.max(1, Math.min(150, steps)),
      }));
    },

    setCfg(cfg: number | null) {
      update((s) => ({
        ...s,
        cfg: cfg === null || Number.isNaN(cfg) ? null : Math.max(0, Math.min(30, cfg)),
      }));
    },

    setSampler(sampler: Sampler | null) {
      update((s) => ({ ...s, sampler }));
    },

    setScheduler(scheduler: Scheduler | null) {
      update((s) => ({ ...s, scheduler }));
    },

    setDenoise(denoise: number | null) {
      update((s) => ({
        ...s,
        denoise:
          denoise === null || Number.isNaN(denoise) ? null : Math.max(0, Math.min(1, denoise)),
      }));
    },

    startJob(jobId: string) {
      update((s) => ({
        ...s,
        activeJobId: jobId,
        jobStatus: 'pending',
        completedJob: null,
        progress: null,
      }));
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
      update((s) => ({
        ...s,
        ...params,
        activeJobId: null,
        jobStatus: null,
        completedJob: null,
        progress: null,
        // Reset image source unless explicitly provided in params
        ...(!params.uploadedImageId && !params.sourceOutputId
          ? { uploadedImageId: null, sourceOutputId: null, selectedImagePreviewUrl: null }
          : {}),
        // Reset i2i aspect to Auto unless explicitly provided in params
        editAspectRatio: params.editAspectRatio !== undefined ? params.editAspectRatio : null,
      }));
      onGenerationDraftPrefill?.();
    },

    reset() {
      set(initial);
      onGenerationDraftReset?.();
    },
  };
}

export const generationStore = createGenerationStore();

/**
 * A stable value comparison for all user-editable generation inputs. UI-only
 * preview URLs and backend job progress are deliberately excluded: neither is
 * user-authored work that needs to block a safe application-shell reload.
 */
export function generationDraftFingerprint(state: GenerationState): string {
  return JSON.stringify({
    provider: state.provider,
    model: state.model,
    mode: state.mode,
    prompt: state.prompt,
    negativePrompt: state.negativePrompt,
    uploadedImageId: state.uploadedImageId,
    sourceOutputId: state.sourceOutputId,
    aspectRatio: state.aspectRatio,
    editAspectRatio: state.editAspectRatio,
    imageCount: state.imageCount,
    videoDuration: state.videoDuration,
    videoResolution: state.videoResolution,
    sizingMode: state.sizingMode,
    imageTier: state.imageTier,
    customWidth: state.customWidth,
    customHeight: state.customHeight,
    seed: state.seed,
    steps: state.steps,
    cfg: state.cfg,
    sampler: state.sampler,
    scheduler: state.scheduler,
    denoise: state.denoise,
  });
}

const initialGenerationDraftFingerprint = generationDraftFingerprint(get(generationStore));
const savedGenerationDraftFingerprint = writable(initialGenerationDraftFingerprint);
const prefillNeedsSaving = writable(false);

// These callbacks are deliberately declared after the singleton is created.
// The store methods close over them and cannot run until module evaluation has
// completed, while the callbacks themselves need the baseline stores above.
const onGenerationDraftReset = () => {
  savedGenerationDraftFingerprint.set(initialGenerationDraftFingerprint);
  prefillNeedsSaving.set(false);
};

const onGenerationDraftPrefill = () => {
  prefillNeedsSaving.set(true);
};

/**
 * A gallery remix/prefill is intentionally dirty even when it happens to
 * equal a prior submitted fingerprint. It was supplied from another view and
 * would otherwise be lost on reload before the user has submitted or reset it.
 */
export const generationDraftIsDirty = derived(
  [generationStore, savedGenerationDraftFingerprint, prefillNeedsSaving],
  ([$state, $savedFingerprint, $prefillNeedsSaving]) =>
    $prefillNeedsSaving || generationDraftFingerprint($state) !== $savedFingerprint,
);

/** Call after the API accepts a generation request; job tracking remains excluded from the baseline. */
export function markGenerationDraftSaved(): void {
  savedGenerationDraftFingerprint.set(generationDraftFingerprint(get(generationStore)));
  prefillNeedsSaving.set(false);
}

export const isGenerating = derived(
  generationStore,
  ($s) =>
    $s.jobStatus !== null &&
    $s.jobStatus !== 'completed' &&
    $s.jobStatus !== 'failed' &&
    $s.jobStatus !== 'cancelled' &&
    $s.jobStatus !== 'moderated',
);

export const canGenerate = derived(
  generationStore,
  ($s) => $s.prompt.trim().length > 0 && !get(isGenerating),
);
