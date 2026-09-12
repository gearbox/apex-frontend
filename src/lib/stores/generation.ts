import { writable, derived, get } from 'svelte/store';
import type { components } from '$lib/api/types';

/** Provider-discovered generation modes are intentionally open-ended. */
export type GenerationMode = string;
type ModelType = components['schemas']['ModelType'];
type AspectRatio = components['schemas']['AspectRatio'];
type JobStatus = components['schemas']['JobStatus'];
type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];
type Resolution = components['schemas']['Resolution'];
type Sampler = components['schemas']['Sampler'];
type Scheduler = components['schemas']['Scheduler'];
type MediaKind = components['schemas']['MediaKind'];
type MediaSlot = components['schemas']['MediaSlot'];

/**
 * Canonical editable source state. Asset refs remain intact so a draft never
 * has to infer whether an ID came from an upload or a prior output.
 */
export interface SourceMediaDraft {
  assetRef: string;
  mediaType: MediaKind | string | null;
  previewUrl: string | null;
  label: string | null;
  /** False only for an unavailable item restored by Re-Generate. */
  available: boolean;
  /**
   * Explicit named-slot intent for a positional contract (`roles !== null`).
   * `null` means generic/interchangeable — legal only against a `roles: null`
   * candidate. This is the single source-level semantic assignment: it
   * travels with the item through append/replace/prefill/normalization
   * rather than living in a second, parallel piece of state.
   */
  role: MediaSlot | null;
}

export interface GenerationState {
  // Model
  model: ModelType;
  mode: GenerationMode;

  // Inputs
  prompt: string;
  negativePrompt: string;
  sourceMedia: SourceMediaDraft[];

  // Parameters
  aspectRatio: AspectRatio; // t2i / video default aspect
  editAspectRatio: AspectRatio | null; // i2i aspect; null = Auto (match source)
  imageCount: number;
  videoDuration: number;
  videoResolution: '480p' | '720p';

  // Workflow image sizing (image_resolution XOR width+height)
  sizingMode: 'tier' | 'custom';
  imageTier: Resolution | null;
  customWidth: number | null;
  customHeight: number | null;

  // Workflow sampler overrides (null = Auto / use model bundle default)
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
    model: 'grok-imagine-image',
    mode: 't2i',
    prompt: '',
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    sourceMedia: [],
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

    appendSourceMedia(source: SourceMediaDraft) {
      update((s) =>
        s.sourceMedia.some((item) => item.assetRef === source.assetRef)
          ? s
          : { ...s, sourceMedia: [...s.sourceMedia, source] },
      );
    },

    /** Replaces a single position while retaining the rest of the ordered draft. */
    replaceSourceMedia(index: number, source: SourceMediaDraft) {
      update((s) => {
        if (index < 0 || index >= s.sourceMedia.length) return s;
        if (
          s.sourceMedia.some(
            (item, itemIndex) => itemIndex !== index && item.assetRef === source.assetRef,
          )
        ) {
          return s;
        }
        const sourceMedia = [...s.sourceMedia];
        sourceMedia[index] = source;
        return { ...s, sourceMedia };
      });
    },

    removeSourceMedia(index: number) {
      update((s) => ({
        ...s,
        sourceMedia: s.sourceMedia.filter((_, itemIndex) => itemIndex !== index),
      }));
    },

    setSourceMedia(sourceMedia: SourceMediaDraft[]) {
      update((s) => ({ ...s, sourceMedia: normalizeSourceMedia(sourceMedia) }));
    },

    /**
     * Reassigns the semantic role of an existing source in place — the sole
     * mutation the positional transition planner needs to "promote" a
     * generic source into a named slot without touching its identity,
     * preview, or position.
     */
    setSourceRole(index: number, role: MediaSlot | null) {
      update((s) => {
        if (index < 0 || index >= s.sourceMedia.length) return s;
        const sourceMedia = [...s.sourceMedia];
        sourceMedia[index] = { ...sourceMedia[index], role };
        return { ...s, sourceMedia };
      });
    },

    setAspectRatio(aspectRatio: AspectRatio) {
      update((s) => ({ ...s, aspectRatio }));
    },

    setEditAspectRatio(editAspectRatio: AspectRatio | null) {
      update((s) => ({ ...s, editAspectRatio }));
    },

    setImageCount(imageCount: number) {
      update((s) => ({ ...s, imageCount: Math.max(1, imageCount) }));
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
      // With exactOptionalPropertyTypes disabled, an explicitly-undefined key would otherwise
      // overwrite a non-nullable field (for example, negativePrompt). Callers use `x ??
      // undefined` to mean "omit", so retain the current value in that case.
      const defined = Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined),
      ) as Partial<GenerationState>;

      update((s) => ({
        ...s,
        ...defined,
        ...(params.sourceMedia === undefined
          ? { sourceMedia: [] }
          : { sourceMedia: normalizeSourceMedia(params.sourceMedia) }),
        activeJobId: null,
        jobStatus: null,
        completedJob: null,
        progress: null,
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
 * Canonical source-list normalization at state boundaries. It preserves the
 * first occurrence and its position, so valid replay order is never changed.
 */
export function normalizeSourceMedia(sourceMedia: readonly SourceMediaDraft[]): SourceMediaDraft[] {
  const unique: SourceMediaDraft[] = [];
  const seen = new Set<string>();
  for (const source of sourceMedia) {
    if (!seen.has(source.assetRef)) {
      seen.add(source.assetRef);
      unique.push(source);
    }
  }
  return unique;
}

/**
 * A stable value comparison for all user-editable generation inputs. UI-only
 * preview URLs and backend job progress are deliberately excluded: neither is
 * user-authored work that needs to block a safe application-shell reload.
 */
export function generationDraftFingerprint(state: GenerationState): string {
  return JSON.stringify({
    model: state.model,
    mode: state.mode,
    prompt: state.prompt,
    negativePrompt: state.negativePrompt,
    sourceMedia: state.sourceMedia.map(({ assetRef, mediaType, available, role }) => ({
      assetRef,
      mediaType,
      available,
      role,
    })),
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
