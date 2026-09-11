<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import apiClient, { isRequestCancellation } from '$lib/api/client';
  import { parseApiError } from '$lib/api/errors';
  import { generateIdempotencyKey } from '$lib/utils/idempotency';
  import {
    generationStore,
    isGenerating,
    markGenerationDraftSaved,
    type GenerationState,
  } from '$lib/stores/generation';
  import { activeJobStore } from '$lib/stores/jobs';
  import { addToast } from '$lib/stores/toasts';
  import { estimatePricingRuleCost, findPricingRule } from '$lib/utils/pricing';
  import { createJobPoller } from '$lib/services/jobPoller';
  import { productInfo } from '$lib/stores/product';
  import { isAgeVerified, isAuthenticated, setUser } from '$lib/stores/auth';
  import { isSSEFallback } from '$lib/stores/eventStream';
  import {
    deriveCardState,
    isGenerateEnabled,
    isProvisioningMode,
    canStartSession,
  } from '$lib/utils/sessionState';
  import {
    sessionDetailQueryOptions,
    startSessionMutationOptions,
    resumeSessionMutationOptions,
  } from '$lib/queries/sessions';
  import * as m from '$paraglide/messages';
  import ModelSelector from '$lib/components/create/ModelSelector.svelte';
  import AgeVerificationModal from '$lib/components/create/AgeVerificationModal.svelte';
  import CreateSessionPanel from '$lib/components/sessions/CreateSessionPanel.svelte';
  import StopSessionModal from '$lib/components/sessions/StopSessionModal.svelte';
  import OperationProgress from '$lib/components/sessions/OperationProgress.svelte';
  import type { components } from '$lib/api/types';
  import type { GpuSessionResponse } from '$lib/api/sessions';
  import type { UserProfile } from '$lib/stores/auth';
  import TypeSelector from '$lib/components/create/TypeSelector.svelte';
  import SourceMediaInput from '$lib/components/create/SourceMediaInput.svelte';
  import PromptInput from '$lib/components/create/PromptInput.svelte';
  import NegativePromptInput from '$lib/components/create/NegativePromptInput.svelte';
  import ParamsPanel from '$lib/components/create/ParamsPanel.svelte';
  import {
    buildGeneratePayload,
    sourceMediaCountForRequest,
    outputCountForRequest,
    validateSourceMedia,
  } from '$lib/utils/generatePayload';
  import { isGenerationParameterSupported, sourceMediaPolicy } from '$lib/utils/modelCapabilities';
  import GenerateButton from '$lib/components/create/GenerateButton.svelte';
  import ResultsPanel from '$lib/components/create/ResultsPanel.svelte';
  import { ROUTES } from '$lib/utils/routes';
  import {
    inheritProjectForCompletedJob,
    trackProjectForJob,
  } from '$lib/services/projectInheritance';
  import { libraryKeys, projectKeys } from '$lib/queries/library';
  import { providersQueryOptions } from '$lib/queries/providers';
  import { billingPricingQueryOptions } from '$lib/queries/billing';
  import { defaultModelGuideSource } from '$lib/content/modelGuides/source';
  import { deriveModelBillingFacts } from '$lib/content/modelGuides/billingFacts';
  import type { ModelGuideExample } from '$lib/content/modelGuides/types';
  import ModelSummaryCard from '$lib/components/create/ModelSummaryCard.svelte';
  import { isGenerationMode } from '$lib/utils/generationModes';
  import { libraryGroupQueryOptions } from '$lib/queries/library';
  import { resolveEffectiveGenerationMode } from '$lib/utils/generationModeResolverAdapter';

  const queryClient = useQueryClient();
  let pricingNowMs = $state(Date.now());

  // Pre-populate prompt from ?prompt= URL parameter (supports deep-linking)
  onMount(() => {
    const prompt = new URLSearchParams(window.location.search).get('prompt');
    if (prompt) generationStore.setPrompt(prompt);

    // Cached pricing can expire while Create remains open. A minute-granularity
    // clock keeps local rule selection reactive, while the query below discovers
    // newly-effective backend rules on the same bounded cadence.
    const pricingClock = window.setInterval(() => {
      pricingNowMs = Date.now();
    }, 60_000);

    return () => window.clearInterval(pricingClock);
  });

  // ── Provider info (model capabilities)
  const providerQuery = createQuery(() => providersQueryOptions($isSSEFallback ? 8000 : false));

  // ── Pricing
  const pricingQuery = createQuery(() => billingPricingQueryOptions(60_000));

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

  const currentGuide = $derived(
    currentModelInfo ? defaultModelGuideSource.get(currentModelInfo.model_key) : null,
  );

  const currentProvisioningMode = $derived(
    isProvisioningMode(currentModelInfo?.provisioningMode)
      ? currentModelInfo.provisioningMode
      : null,
  );

  const billingFacts = $derived(
    deriveModelBillingFacts({
      modelInfo: currentModelInfo,
      provider: currentModelInfo?.provider ?? null,
      provisioningMode: currentProvisioningMode,
      pricing: pricingQuery.data ?? [],
      nowMs: pricingNowMs,
    }),
  );

  // When the stored model is no longer in the providers list (e.g. first load with
  // only on-demand models), fall back to the first available model automatically.
  $effect(() => {
    if (currentModelInfo === null && allModels.length > 0) {
      generationStore.setModel(
        (allModels.find((model) => model.is_enabled) ?? allModels[0]).model_key as ModelType,
      );
    }
  });

  // Runtime owns the selected model/session association. Session-list and runtime snapshots can
  // legitimately disagree, so the list must never veto a Cancel/Stop target.
  const selectedSessionId = $derived(currentModelInfo?.runtime?.session_id ?? null);

  // This is a normal snapshot read, not provisioning polling. It provides legacy Stop/timer
  // compatibility while the provider runtime remains the sole card-state authority.
  const selectedSessionQuery = createQuery(() =>
    sessionDetailQueryOptions(queryClient, selectedSessionId, {
      enabled: selectedSessionId !== null,
      refetchInterval: $isSSEFallback ? 8000 : false,
    }),
  );
  const selectedSession = $derived(selectedSessionQuery.data ?? null);
  const selectedOperationId = $derived(currentModelInfo?.runtime?.operation_id ?? null);
  const selectedBootstrapOperationId = $derived(selectedSession?.bootstrap_operation?.id ?? null);

  // ── Card state machine
  const cardState = $derived(
    currentModelInfo
      ? currentProvisioningMode
        ? deriveCardState({
            provisioningMode: currentProvisioningMode,
            available: currentModelInfo.providerAvailable,
            isEnabled: currentModelInfo.is_enabled,
            runtime: currentModelInfo.runtime,
            isAuthenticated: $isAuthenticated,
          })
        : 'UNAVAILABLE'
      : 'READY', // no model selected yet → don't block UI
  );

  // Providers query hasn't resolved yet (data is undefined only during the very first
  // load) → currentModelInfo is a false null and the stored aspectRatio hasn't been
  // validated against the real model yet. Block generation until it settles instead of
  // letting a stale default aspect ratio slip through buildGeneratePayload.
  const providersReady = $derived(providerQuery.data !== undefined);
  const generateEnabled = $derived(
    providersReady && currentModelInfo?.is_enabled === true && isGenerateEnabled(cardState),
  );

  // ── Start session mutation
  const startMutation = createMutation(() => startSessionMutationOptions(queryClient));

  function handleStart() {
    if (
      !currentModelInfo ||
      currentProvisioningMode !== 'on_demand' ||
      !currentModelInfo.providerAvailable ||
      !canStartSession(cardState)
    ) {
      return;
    }
    startMutation.mutate(currentModelInfo.model_key as ModelType, {
      onError: (err) => {
        if (isRequestCancellation(err)) return;
        const e = parseApiError(err, 0);
        addToast({
          type: e.error === 'session_already_exists' ? 'warning' : 'error',
          message:
            e.error === 'session_already_exists'
              ? m.session_already_exists()
              : e.message || m.error_start_session_failed(),
        });
      },
    });
  }

  const resumeMutation = createMutation(() => resumeSessionMutationOptions(queryClient));

  function handleResume() {
    if (!selectedSessionId || cardState !== 'PAUSED' || resumeMutation.isPending) return;
    resumeMutation.mutate(selectedSessionId, {
      onError: (err) => {
        if (isRequestCancellation(err)) return;
        addToast({ type: 'error', message: parseApiError(err, 0).message });
      },
    });
  }

  // ── Stop / Cancel modal
  let stopModalSessionId = $state<string | null>(null);

  function handleStopRequest() {
    if (selectedSessionId) stopModalSessionId = selectedSessionId;
  }

  // Cache reconciliation for a confirmed stop is owned by `confirmedStopMutationOptions` itself;
  // this callback is UI-only.
  function handleStopped(_session: GpuSessionResponse) {
    stopModalSessionId = null;
  }

  // ── Effective generation mode
  // A single pure resolution drives pricing, source validation, payload
  // `generation_type`, the submit guard, and mode-sensitive parameter UI —
  // never independent reads of `$generationStore.mode`. See
  // `resolveEffectiveGenerationMode` for the Phase-2 TypeSelector compatibility
  // boundary this wraps around the pure `resolveGenerationMode`.
  const modeResolution = $derived(
    resolveEffectiveGenerationMode($generationStore, currentModelInfo),
  );
  // Only `resolved`/`incomplete` carry a concrete mode. The raw fallback here is
  // for non-submission-affecting param UI only (e.g. video-vs-image layout) —
  // pricing/validation/payload/submit all gate on `modeResolution.status`
  // directly and never rely on this fallback.
  const effectiveMode = $derived(
    modeResolution.status === 'resolved' || modeResolution.status === 'incomplete'
      ? modeResolution.mode
      : $generationStore.mode,
  );
  const effectiveState = $derived<GenerationState>({ ...$generationStore, mode: effectiveMode });

  // Mirror the backend quote: a matching rule is priced against the exact
  // normalized request state that buildGeneratePayload will submit. No quote
  // is computed unless the mode is unambiguously resolved.
  const currentPricingRule = $derived(
    pricingQuery.data && currentModelInfo && modeResolution.status === 'resolved'
      ? findPricingRule(
          pricingQuery.data,
          currentModelInfo.provider,
          $generationStore.model,
          modeResolution.mode,
          pricingNowMs,
        )
      : null,
  );
  const currentOutputCount = $derived(outputCountForRequest($generationStore, currentModelInfo));
  const currentSourceMediaCount = $derived(
    sourceMediaCountForRequest(effectiveState, currentModelInfo),
  );
  const currentEstimatedCost = $derived(
    currentPricingRule && currentSourceMediaCount !== null
      ? estimatePricingRuleCost(currentPricingRule, {
          outputCount: currentOutputCount,
          inputImageCount: currentSourceMediaCount,
        })
      : null,
  );

  // Derive app title from productInfo for <title> tag
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  type ModelType = components['schemas']['ModelType'];

  function handleUseGuideExample(modelKey: ModelType, example: ModelGuideExample) {
    if (!isGenerationMode(example.mode)) return;
    generationStore.prefill({
      model: modelKey,
      mode: example.mode,
      prompt: example.prompt,
      aspectRatio: example.aspectRatio,
    });
  }

  // Source controls stay gated on the raw explicit Type intent (Phase 3 scope
  // makes this source-driven instead) — see `resolveEffectiveGenerationMode`.
  const sourcePolicy = $derived(sourceMediaPolicy(currentModelInfo, $generationStore.mode));
  const sourceValidation = $derived(validateSourceMedia(effectiveState, currentModelInfo));
  const canSubmit = $derived(
    generateEnabled && modeResolution.status === 'resolved' && sourceValidation.valid,
  );

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

  // ── i2i aspect-reshape 400 error (inline, under the aspect control)
  let aspectError = $state<string | null>(null);
  const aspectErrorResetKey = $derived(
    `${$generationStore.mode}|${$generationStore.model}|${$generationStore.editAspectRatio}`,
  );

  $effect(() => {
    void aspectErrorResetKey; // dependency: clear the inline 400 on mode/model/aspect change
    aspectError = null;
  });

  function handleJobError(error: unknown, submittedMode: GenerationState['mode']): void {
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
        message: m.error_insufficient_tokens(),
        action: { label: m.billing_buy_more_cta(), href: ROUTES.billing },
      });
    } else if (apiErr.error === 'idempotency_conflict') {
      addToast({
        type: 'warning',
        message: m.error_idempotency_conflict(),
      });
    } else if (apiErr.error === 'service_unavailable') {
      addToast({ type: 'warning', message: m.error_service_unavailable() });
    } else if (apiErr.error === 'moderation') {
      addToast({ type: 'warning', message: apiErr.message });
    } else if (apiErr.error === 'unsupported_generation_parameter') {
      // This should be unreachable after projecting through discovery. Keep a
      // safe diagnostic signal while still showing the backend's public text.
      console.error('[generation] capability contract failure', {
        model: $generationStore.model,
        generationType: submittedMode,
      });
      addToast({ type: 'error', message: apiErr.message });
    } else {
      addToast({
        type: 'error',
        message: apiErr.message || m.error_generation_start_failed(),
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
        queryClient.invalidateQueries({ queryKey: ['billing', 'balance'] });
        // Project membership is convenience metadata, applied after the backend has
        // materialized outputs. A failure never changes generation success semantics.
        void inheritProjectForCompletedJob(job)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: libraryKeys.all });
            queryClient.invalidateQueries({ queryKey: projectKeys.all });
          })
          .catch(() => undefined);
      },
      onError: (err) => {
        const msg = err.message;
        if (msg.includes('Max retries')) {
          addToast({ type: 'error', message: m.error_generation_status_unknown() });
          generationStore.setError();
          activeJobStore.clear();
        } else if (msg.includes('retrying')) {
          addToast({ type: 'warning', message: m.error_connection_retrying(), durationMs: 2000 });
        } else {
          addToast({ type: 'error', message: msg });
          generationStore.setError();
          activeJobStore.clear();
        }
      },
    }).stop;
  }

  async function handleGenerate() {
    if (submitting || $isGenerating || !generateEnabled) return;

    if (currentModelInfo?.requires_age_verification && !$isAgeVerified) {
      pendingModelKey = null;
      showAgeModal = true;
      return;
    }

    // The submit guard: an ambiguous/incomplete/invalid resolution never
    // reaches the request. `state.mode` below is always the same resolved
    // mode that was priced and validated above.
    if (!currentModelInfo?.is_enabled || modeResolution.status !== 'resolved') {
      addToast({ type: 'error', message: m.error_generation_mode_unavailable() });
      return;
    }

    const state = effectiveState;

    if (!sourceValidation.valid) {
      addToast({
        type: 'error',
        message: sourceValidation.message ?? m.error_source_image_required(),
      });
      return;
    }

    // Guard: prevent submitting an incomplete custom-size pair
    if (
      isGenerationParameterSupported(currentModelInfo, 'width') &&
      isGenerationParameterSupported(currentModelInfo, 'height') &&
      state.sizingMode === 'custom' &&
      (state.customWidth === null) !== (state.customHeight === null)
    ) {
      addToast({ type: 'error', message: m.error_custom_size_incomplete() });
      return;
    }

    submitting = true;
    const idempotencyKey = generateIdempotencyKey();

    try {
      const body = buildGeneratePayload(state, currentModelInfo);
      const { data, error, response } = await apiClient.POST('/v1/generate', {
        body,
        params: {
          header: { 'Idempotency-Key': idempotencyKey },
        },
      });

      if (error) {
        if (response.status === 400 && state.mode === 'i2i' && state.editAspectRatio !== null) {
          aspectError = parseApiError(error, response.status).message;
          return;
        }
        handleJobError(error, state.mode);
        return;
      }

      const jobId = data && 'job_id' in data ? (data as { job_id: string }).job_id : undefined;
      if (!jobId) {
        addToast({ type: 'error', message: m.error_generation_start_failed() });
        return;
      }

      // The accepted request is recoverable from Jobs/Gallery. Establishing a
      // saved baseline here means only later user edits block a PWA reload.
      markGenerationDraftSaved();
      trackProjectForJob(jobId);
      generationStore.startJob(jobId);
      startPolling(jobId);
    } catch {
      addToast({ type: 'error', message: m.error_unexpected() });
    } finally {
      submitting = false;
    }
  }

  onDestroy(() => {
    stopPoller?.();
  });

  const showSourceMediaInput = $derived(sourcePolicy.accepted);
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

    <ModelSummaryCard
      modelInfo={currentModelInfo}
      guide={currentGuide}
      {billingFacts}
      pricingPending={pricingQuery.isPending}
      {currentEstimatedCost}
      onuseexample={handleUseGuideExample}
    />

    <TypeSelector modelInfo={currentModelInfo ?? null} />

    {#if showSourceMediaInput}
      <SourceMediaInput policy={sourcePolicy} />
    {/if}

    <PromptInput />
    {#if isGenerationParameterSupported(currentModelInfo, 'negative_prompt')}
      <NegativePromptInput />
    {/if}
    <ParamsPanel modelInfo={currentModelInfo} {aspectError} mode={effectiveMode} />

    <!-- Results (mobile: inline below form) -->
    <div class="md:hidden">
      <ResultsPanel
        {showSkeleton}
        providers={providerQuery.data}
        loadGroup={(jobId) => queryClient.ensureQueryData(libraryGroupQueryOptions(jobId))}
      />
    </div>

    <!-- Session state panel: badge + in-place CTA for the selected model -->
    <CreateSessionPanel
      {cardState}
      session={selectedSession}
      starting={startMutation.isPending}
      typicalBootstrapSeconds={currentModelInfo?.provisioning?.typical_bootstrap_seconds ?? null}
      onStart={handleStart}
      onStopRequest={handleStopRequest}
      onResume={cardState === 'PAUSED' && selectedSessionId ? handleResume : null}
      resuming={resumeMutation.isPending}
    />

    {#if selectedSessionId && selectedOperationId && (cardState === 'PROVISIONING' || cardState === 'RESTARTING' || cardState === 'REMOVING')}
      <OperationProgress
        sessionId={selectedSessionId}
        operationId={selectedOperationId}
        bootstrapOperationId={selectedBootstrapOperationId}
        typicalBootstrapSeconds={currentModelInfo?.provisioning?.typical_bootstrap_seconds}
        typicalAttachSeconds={currentModelInfo?.provisioning?.typical_attach_seconds}
      />
    {/if}

    <!-- Generate button (desktop, inline at bottom of controls) -->
    <div class="hidden md:block">
      <GenerateButton
        onclick={handleGenerate}
        {submitting}
        estimatedCost={currentEstimatedCost}
        disabled={!canSubmit}
      />
    </div>
  </div>

  <!-- Results panel (desktop only) -->
  <div class="hidden flex-1 overflow-y-auto md:block">
    <ResultsPanel
      {showSkeleton}
      providers={providerQuery.data}
      loadGroup={(jobId) => queryClient.ensureQueryData(libraryGroupQueryOptions(jobId))}
    />
  </div>
</div>

<!-- Generate button (mobile sticky bar) -->
<div
  class="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 border-t border-border bg-bg p-4 md:hidden"
>
  <GenerateButton
    onclick={handleGenerate}
    {submitting}
    estimatedCost={currentEstimatedCost}
    disabled={!canSubmit}
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
