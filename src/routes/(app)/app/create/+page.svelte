<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import apiClient from '$lib/api/client';
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

  // ── Provider info (model capabilities)
  const providerQuery = createQuery(() => ({
    queryKey: ['grok-provider'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/grok');
      return data ?? null;
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

  // Reactively update estimated cost
  $effect(() => {
    const pricing = pricingQuery.data;
    if (!pricing) return;
    const cost = lookupCost(pricing, 'grok', $generationStore.model, $generationStore.mode);
    generationStore.setEstimatedCost(cost);
  });

  // ── Current model info
  const currentModelInfo = $derived(
    (providerQuery.data?.models ?? []).find((m: { model: string }) => m.model === $generationStore.model) ?? null,
  );

  // ── Job polling
  let stopPoller: (() => void) | null = null;
  let submitting = $state(false);

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
    submitting = true;

    try {
      let jobId: string | undefined;

      if (state.mode === 't2i') {
        const { data, response } = await apiClient.POST('/v1/grok/image', {
          body: {
            prompt: state.prompt,
            model: state.model,
            n: state.imageCount,
            aspect_ratio: state.aspectRatio,
          },
        });
        if (response.status === 402) {
          addToast({ type: 'error', message: 'Not enough tokens.', action: { label: 'Buy more →', href: '/app/billing' } });
          return;
        }
        if (response.status === 503) {
          addToast({ type: 'warning', message: 'AI provider temporarily unavailable' });
          return;
        }
        if (response.status === 422) {
          addToast({ type: 'warning', message: 'Content blocked by moderation policy' });
          return;
        }
        jobId = data?.job_id;
      } else if (state.mode === 'i2i') {
        if (!state.uploadedImageId) {
          addToast({ type: 'error', message: 'Please upload a source image first.' });
          return;
        }
        const { data, response } = await apiClient.POST('/v1/grok/image/edit', {
          body: {
            prompt: state.prompt,
            input_image_id: state.uploadedImageId,
            model: state.model,
          },
        });
        if (response.status === 402) {
          addToast({ type: 'error', message: 'Not enough tokens.', action: { label: 'Buy more →', href: '/app/billing' } });
          return;
        }
        if (response.status === 422) {
          addToast({ type: 'warning', message: 'Content blocked by moderation policy' });
          return;
        }
        jobId = data?.job_id;
      } else if (state.mode === 't2v') {
        const { data, response } = await apiClient.POST('/v1/grok/video', {
          body: {
            prompt: state.prompt,
            model: state.model,
            duration: state.videoDuration,
            aspect_ratio: state.aspectRatio,
            resolution: state.videoResolution,
          },
        });
        if (response.status === 402) {
          addToast({ type: 'error', message: 'Not enough tokens.', action: { label: 'Buy more →', href: '/app/billing' } });
          return;
        }
        if (response.status === 503) {
          addToast({ type: 'warning', message: 'AI provider temporarily unavailable' });
          return;
        }
        jobId = data?.job_id;
      } else if (state.mode === 'i2v') {
        if (!state.uploadedImageId) {
          addToast({ type: 'error', message: 'Please upload a source image first.' });
          return;
        }
        const { data, response } = await apiClient.POST('/v1/grok/video/from-image', {
          body: {
            prompt: state.prompt,
            input_image_id: state.uploadedImageId,
            model: state.model,
            duration: state.videoDuration,
          },
        });
        if (response.status === 402) {
          addToast({ type: 'error', message: 'Not enough tokens.', action: { label: 'Buy more →', href: '/app/billing' } });
          return;
        }
        jobId = data?.job_id;
      }

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
    $generationStore.mode === 'i2i' || $generationStore.mode === 'i2v',
  );
  const showSkeleton = $derived($isGenerating);
</script>

<svelte:head>
  <title>Create — Apex</title>
</svelte:head>

<!-- Desktop: side-by-side panels. Mobile: single-column scroll. -->
<div class="flex flex-col md:h-full md:flex-row md:gap-6">
  <!-- Controls column -->
  <div class="flex flex-col gap-4 p-4 pb-24 md:w-[400px] md:shrink-0 md:overflow-y-auto md:p-0 md:pb-5">

    <ModelSelector models={providerQuery.data?.models ?? []} />

    <TypeSelector modelInfo={currentModelInfo} />

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
      <GenerateButton onclick={handleGenerate} {submitting} />
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
