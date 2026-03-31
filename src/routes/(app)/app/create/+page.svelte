<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import apiClient from '$lib/api/client';
  import { parseApiError } from '$lib/api/errors';
  import { generateIdempotencyKey } from '$lib/utils/idempotency';
  import { generationStore, isGenerating } from '$lib/stores/generation';
  import { activeJobStore } from '$lib/stores/jobs';
  import { addToast } from '$lib/stores/toasts';
  import { lookupCost } from '$lib/utils/pricing';
  import { createJobPoller } from '$lib/services/jobPoller';
  import ModelSelector from '$lib/components/create/ModelSelector.svelte';
  import TypeSelector from '$lib/components/create/TypeSelector.svelte';
  import ImageUpload from '$lib/components/create/ImageUpload.svelte';
  import PromptInput from '$lib/components/create/PromptInput.svelte';
  import NegativePromptInput from '$lib/components/create/NegativePromptInput.svelte';
  import ParamsPanel from '$lib/components/create/ParamsPanel.svelte';
  import GenerateButton from '$lib/components/create/GenerateButton.svelte';
  import ResultsPanel from '$lib/components/create/ResultsPanel.svelte';

  const queryClient = useQueryClient();

  // Pre-populate prompt from ?prompt= URL parameter (supports deep-linking)
  onMount(() => {
    const prompt = new URLSearchParams(window.location.search).get('prompt');
    if (prompt) generationStore.setPrompt(prompt);
  });

  // ── Provider info (model capabilities)
  const providerQuery = createQuery(() => ({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/providers');
      return data ?? { providers: [], user_context: null };
    },
    staleTime: 60 * 60 * 1000,
  }));

  // ── Pricing
  const pricingQuery = createQuery(() => ({
    queryKey: ['pricing'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/billing/pricing');
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  }));

  // Flatten all models from all providers, attaching the provider string for pricing lookup
  const allModels = $derived(
    (providerQuery.data?.providers ?? []).flatMap((p) =>
      p.models.map((m) => ({ ...m, provider: p.provider })),
    ),
  );

  // ── Current model info (includes provider for pricing lookup)
  const currentModelInfo = $derived(
    allModels.find((m) => m.model_key === $generationStore.model) ?? null,
  );

  // Derived estimated cost (per unit — imageCount multiplier applied in CostPreview)
  const estimatedCost = $derived(
    pricingQuery.data && currentModelInfo
      ? lookupCost(pricingQuery.data, currentModelInfo.provider, $generationStore.model, $generationStore.mode)
      : 0,
  );

  // ── Job polling
  let stopPoller: (() => void) | null = null;
  let submitting = $state(false);

  function handleJobError(error: unknown): void {
    const apiErr = parseApiError(error, 0);
    if (apiErr.error === 'insufficient_balance') {
      addToast({ type: 'error', message: 'Not enough tokens.', action: { label: 'Buy more →', href: '/app/billing' } });
    } else if (apiErr.error === 'idempotency_conflict') {
      addToast({ type: 'warning', message: 'Request already in progress. Please wait a moment and try again.' });
    } else if (apiErr.error === 'service_unavailable') {
      addToast({ type: 'warning', message: 'AI provider temporarily unavailable' });
    } else if (apiErr.error === 'moderation') {
      addToast({ type: 'warning', message: apiErr.message });
    } else {
      addToast({ type: 'error', message: apiErr.message || 'Failed to start generation. Please try again.' });
    }
  }

  function startPolling(jobId: string) {
    stopPoller?.();
    activeJobStore.setJob(jobId, 'pending');

    stopPoller = createJobPoller({
      jobId,
      onUpdate: (job) => {
        generationStore.setStatus(job.status);
        activeJobStore.updateStatus(job.status);
      },
      onComplete: (job) => {
        generationStore.setComplete(job);
        activeJobStore.clear();
        queryClient.invalidateQueries({ queryKey: ['gallery'] });
        queryClient.invalidateQueries({ queryKey: ['balance'] });
      },
      onError: (err) => {
        const msg = err.message;
        if (msg.includes('Max retries')) {
          addToast({ type: 'error', message: 'Generation status unknown. Check Jobs page.' });
          generationStore.setError();
          activeJobStore.clear();
        } else if (msg.includes('retrying')) {
          addToast({ type: 'warning', message: 'Connection issue — retrying…', durationMs: 2000 });
        } else {
          addToast({ type: 'error', message: msg });
          generationStore.setError();
          activeJobStore.clear();
        }
      },
    }).stop;
  }

  async function handleGenerate() {
    if (submitting || $isGenerating) return;

    const state = $generationStore;

    if (
      (state.mode === 'i2i' || state.mode === 'i2v' || state.mode === 'flf2v') &&
      !state.uploadedImageId &&
      !state.sourceOutputId
    ) {
      addToast({ type: 'error', message: 'Please select or upload a source image first.' });
      return;
    }

    submitting = true;
    const idempotencyKey = generateIdempotencyKey();

    try {
      const { data, error } = await apiClient.POST('/v1/generate', {
        body: {
          prompt: state.prompt,
          generation_type: state.mode,
          model: state.model,
          ...(state.uploadedImageId ? { input_image_id: state.uploadedImageId } : {}),
          ...(state.sourceOutputId ? { source_output_id: state.sourceOutputId } : {}),
          aspect_ratio: state.aspectRatio,
          n: state.imageCount,
          duration: state.videoDuration,
          resolution: state.videoResolution,
        },
        params: {
          header: { 'Idempotency-Key': idempotencyKey },
        },
      });

      if (error) { handleJobError(error); return; }

      const jobId = data && 'job_id' in data ? (data as { job_id: string }).job_id : undefined;
      if (!jobId) {
        addToast({ type: 'error', message: 'Failed to start generation. Please try again.' });
        return;
      }

      generationStore.startJob(jobId);
      startPolling(jobId);
    } catch {
      addToast({ type: 'error', message: 'An unexpected error occurred. Please try again.' });
    } finally {
      submitting = false;
    }
  }

  onDestroy(() => {
    stopPoller?.();
  });

  const showImageUpload = $derived(
    $generationStore.mode === 'i2i' || $generationStore.mode === 'i2v' || $generationStore.mode === 'flf2v',
  );
  const showSkeleton = $derived($isGenerating);
</script>

<svelte:head>
  <title>Create — Apex</title>
</svelte:head>

<!-- Desktop: side-by-side panels. Mobile: single-column scroll. -->
<div class="flex flex-col md:h-full md:flex-row md:gap-6">
  <!-- Controls column -->
  <div class="flex flex-col gap-4 p-4 pb-24 md:w-100 md:shrink-0 md:overflow-y-auto md:p-0 md:pb-5">

    <ModelSelector models={allModels} />

    <TypeSelector modelInfo={currentModelInfo ?? null} />

    {#if showImageUpload}
      <ImageUpload />
    {/if}

    <PromptInput />
    <NegativePromptInput />
    <ParamsPanel />

    <!-- Results (mobile: inline below form) -->
    <div class="md:hidden">
      <ResultsPanel showSkeleton={showSkeleton} />
    </div>

    <!-- Generate button (desktop, inline at bottom of controls) -->
    <div class="hidden md:block">
      <GenerateButton onclick={handleGenerate} {submitting} {estimatedCost} />
    </div>
  </div>

  <!-- Results panel (desktop only) -->
  <div class="hidden flex-1 overflow-y-auto md:block">
    <ResultsPanel showSkeleton={showSkeleton} />
  </div>
</div>

<!-- Generate button (mobile sticky bar) -->
<div class="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 border-t border-border bg-bg p-4 md:hidden">
  <GenerateButton onclick={handleGenerate} {submitting} />
</div>
