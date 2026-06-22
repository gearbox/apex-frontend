<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import apiClient from '$lib/api/client';
  import { parseApiError } from '$lib/api/errors';
  import { generateIdempotencyKey } from '$lib/utils/idempotency';
  import { generationStore, isGenerating } from '$lib/stores/generation';
  import { activeJobStore } from '$lib/stores/jobs';
  import { addToast } from '$lib/stores/toasts';
  import { lookupCost } from '$lib/utils/pricing';
  import { createJobPoller } from '$lib/services/jobPoller';
  import { productInfo } from '$lib/stores/product';
  import { isAgeVerified, isAuthenticated, setUser } from '$lib/stores/auth';
  import { isSSEFallback } from '$lib/stores/eventStream';
  import {
    deriveCardState,
    isGenerateEnabled,
    isTerminalStatus,
    type ProvisioningMode,
    type SessionState,
  } from '$lib/utils/sessionState';
  import { sessionsListQueryOptions, startSessionMutationOptions } from '$lib/queries/sessions';
  import * as m from '$paraglide/messages';
  import ModelSelector from '$lib/components/create/ModelSelector.svelte';
  import AgeVerificationModal from '$lib/components/create/AgeVerificationModal.svelte';
  import CreateSessionPanel from '$lib/components/sessions/CreateSessionPanel.svelte';
  import StopSessionModal from '$lib/components/sessions/StopSessionModal.svelte';
  import type { components } from '$lib/api/types';
  import type { UserProfile } from '$lib/stores/auth';
  import TypeSelector from '$lib/components/create/TypeSelector.svelte';
  import ImageUpload from '$lib/components/create/ImageUpload.svelte';
  import PromptInput from '$lib/components/create/PromptInput.svelte';
  import NegativePromptInput from '$lib/components/create/NegativePromptInput.svelte';
  import ParamsPanel from '$lib/components/create/ParamsPanel.svelte';
  import { buildGeneratePayload } from '$lib/utils/generatePayload';
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

  // Flatten all models from all providers, attaching provider metadata for pricing + session hooks
  const allModels = $derived(
    (providerQuery.data?.providers ?? []).flatMap((p) =>
      p.models.map((m) => ({
        ...m,
        provider: p.provider,
        provisioningMode: p.provisioning_mode,
        providerAvailable: p.available,
      })),
    ),
  );

  // ── Current model info (includes provider for pricing lookup)
  const currentModelInfo = $derived(
    allModels.find((m) => m.model_key === $generationStore.model) ?? null,
  );

  // When the stored model is no longer in the providers list (e.g. first load with
  // only on-demand models), fall back to the first available model automatically.
  $effect(() => {
    if (currentModelInfo === null && allModels.length > 0) {
      generationStore.setModel(allModels[0].model_key as never);
    }
  });

  // ── Sessions query (to resolve session id/timer/cost for the selected model)
  const sessionsQuery = createQuery(() =>
    sessionsListQueryOptions(false, $isSSEFallback ? 8000 : false),
  );

  const selectedSession = $derived(
    (sessionsQuery.data ?? []).find(
      (s) => s.model_type === currentModelInfo?.model_key && !isTerminalStatus(s.status),
    ) ?? null,
  );

  // ── Card state machine
  const cardState = $derived(
    currentModelInfo
      ? deriveCardState({
          provisioningMode: currentModelInfo.provisioningMode as ProvisioningMode,
          available: currentModelInfo.providerAvailable,
          sessionState: currentModelInfo.session_state as SessionState | null,
          isAuthenticated: $isAuthenticated,
        })
      : 'READY', // no model selected yet → don't block UI
  );

  const generateEnabled = $derived(isGenerateEnabled(cardState));

  // ── Start session mutation
  const startMutation = createMutation(() => startSessionMutationOptions(queryClient));

  function handleStart() {
    if (!currentModelInfo) return;
    startMutation.mutate(currentModelInfo.model_key as never, {
      onError: (err) => {
        const e = parseApiError(err, 0);
        addToast({
          type: e.error === 'session_already_exists' ? 'warning' : 'error',
          message:
            e.error === 'session_already_exists'
              ? m.session_already_exists()
              : e.message || 'Failed to start session',
        });
      },
    });
  }

  // ── Stop / Cancel modal
  let stopModalSessionId = $state<string | null>(null);

  function handleStopRequest() {
    if (selectedSession) stopModalSessionId = selectedSession.id;
  }

  function handleStopped() {
    stopModalSessionId = null;
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['providers'] });
  }

  // Derived estimated cost (per unit — imageCount multiplier applied in CostPreview)
  const estimatedCost = $derived(
    pricingQuery.data && currentModelInfo
      ? lookupCost(
          pricingQuery.data,
          currentModelInfo.provider,
          $generationStore.model,
          $generationStore.mode,
        )
      : 0,
  );

  // Derive app title from productInfo for <title> tag
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  type ModelType = components['schemas']['ModelType'];

  // ── Age gate state
  let showAgeModal = $state(false);
  let pendingModelKey = $state<ModelType | null>(null);

  function handleModelSelect(key: ModelType) {
    const info = allModels.find((m) => m.model_key === key);
    if (info?.requires_age_verification && !$isAgeVerified) {
      pendingModelKey = key;
      showAgeModal = true;
      return;
    }
    generationStore.setModel(key);
  }

  function handleAgeVerified(updatedProfile: UserProfile) {
    setUser(updatedProfile);
    if (pendingModelKey) generationStore.setModel(pendingModelKey);
    pendingModelKey = null;
    showAgeModal = false;
  }

  // ── Job polling
  let stopPoller: (() => void) | null = null;
  let submitting = $state(false);

  function handleJobError(error: unknown): void {
    const apiErr = parseApiError(error, 0);
    if (apiErr.error === 'age_verification_required') {
      showAgeModal = true;
    } else if (apiErr.error === 'no_active_gpu_session') {
      // Defensive fallback: should rarely fire now that Generate is gated on READY
      addToast({
        type: 'warning',
        message: m.error_no_active_gpu_session(),
        action: { label: m.create_start_session_cta(), href: '/app/sessions' },
      });
    } else if (apiErr.error === 'insufficient_balance') {
      addToast({
        type: 'error',
        message: 'Not enough tokens.',
        action: { label: 'Buy more →', href: '/app/billing' },
      });
    } else if (apiErr.error === 'idempotency_conflict') {
      addToast({
        type: 'warning',
        message: 'Request already in progress. Please wait a moment and try again.',
      });
    } else if (apiErr.error === 'service_unavailable') {
      addToast({ type: 'warning', message: 'AI provider temporarily unavailable' });
    } else if (apiErr.error === 'moderation') {
      addToast({ type: 'warning', message: apiErr.message });
    } else {
      addToast({
        type: 'error',
        message: apiErr.message || 'Failed to start generation. Please try again.',
      });
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

    if (currentModelInfo?.requires_age_verification && !$isAgeVerified) {
      pendingModelKey = null;
      showAgeModal = true;
      return;
    }

    if (
      (state.mode === 'i2i' || state.mode === 'i2v' || state.mode === 'flf2v') &&
      !state.uploadedImageId &&
      !state.sourceOutputId
    ) {
      addToast({ type: 'error', message: 'Please select or upload a source image first.' });
      return;
    }

    // Guard: prevent submitting an incomplete custom-size pair
    if (
      currentModelInfo?.image?.supported_tiers != null &&
      state.sizingMode === 'custom' &&
      (state.customWidth === null) !== (state.customHeight === null)
    ) {
      addToast({ type: 'error', message: 'Both width and height are required for custom size.' });
      return;
    }

    submitting = true;
    const idempotencyKey = generateIdempotencyKey();

    try {
      const body = buildGeneratePayload(state, currentModelInfo);
      const { data, error } = await apiClient.POST('/v1/generate', {
        body,
        params: {
          header: { 'Idempotency-Key': idempotencyKey },
        },
      });

      if (error) {
        handleJobError(error);
        return;
      }

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
    $generationStore.mode === 'i2i' ||
      $generationStore.mode === 'i2v' ||
      $generationStore.mode === 'flf2v',
  );
  const showSkeleton = $derived($isGenerating);
</script>

<svelte:head>
  <title>Create — {appTitle}</title>
</svelte:head>

<!-- Desktop: side-by-side panels. Mobile: single-column scroll. -->
<div class="flex flex-col md:h-full md:flex-row md:gap-6">
  <!-- Controls column -->
  <div class="flex flex-col gap-4 p-4 pb-24 md:w-100 md:shrink-0 md:overflow-y-auto md:p-0 md:pb-5">
    <ModelSelector
      models={allModels}
      selectedModel={$generationStore.model}
      onSelect={handleModelSelect}
    />

    <TypeSelector modelInfo={currentModelInfo ?? null} />

    {#if showImageUpload}
      <ImageUpload />
    {/if}

    <PromptInput />
    {#if currentModelInfo?.supports_negative_prompt === true}
      <NegativePromptInput />
    {/if}
    <ParamsPanel modelInfo={currentModelInfo} />

    <!-- Results (mobile: inline below form) -->
    <div class="md:hidden">
      <ResultsPanel {showSkeleton} />
    </div>

    <!-- Session state panel: badge + in-place CTA for the selected model -->
    <CreateSessionPanel
      {cardState}
      session={selectedSession}
      starting={startMutation.isPending}
      onStart={handleStart}
      onStopRequest={handleStopRequest}
    />

    <!-- Generate button (desktop, inline at bottom of controls) -->
    <div class="hidden md:block">
      <GenerateButton
        onclick={handleGenerate}
        {submitting}
        {estimatedCost}
        disabled={!generateEnabled}
      />
    </div>
  </div>

  <!-- Results panel (desktop only) -->
  <div class="hidden flex-1 overflow-y-auto md:block">
    <ResultsPanel {showSkeleton} />
  </div>
</div>

<!-- Generate button (mobile sticky bar) -->
<div
  class="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 border-t border-border bg-bg p-4 md:hidden"
>
  <GenerateButton
    onclick={handleGenerate}
    {submitting}
    {estimatedCost}
    disabled={!generateEnabled}
  />
</div>

{#if stopModalSessionId}
  <StopSessionModal
    sessionId={stopModalSessionId}
    onStopped={handleStopped}
    onClose={() => (stopModalSessionId = null)}
  />
{/if}

{#if showAgeModal}
  <AgeVerificationModal onVerified={handleAgeVerified} onClose={() => (showAgeModal = false)} />
{/if}
