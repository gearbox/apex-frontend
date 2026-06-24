<script lang="ts">
  import { goto } from '$app/navigation';
  import { createQuery } from '@tanstack/svelte-query';
  import { generationStore } from '$lib/stores/generation';
  import { balanceQueryOptions, canStartNewWork } from '$lib/stores/balanceGate';
  import CostPreview from './CostPreview.svelte';
  import * as m from '$paraglide/messages';

  let {
    onclick,
    submitting = false,
    estimatedCost = 0,
    disabled: externalDisabled = false,
  }: {
    onclick: () => void;
    submitting?: boolean;
    estimatedCost?: number;
    disabled?: boolean;
  } = $props();

  const balanceQuery = createQuery(balanceQueryOptions);

  const hasBalance = $derived(canStartNewWork(balanceQuery.data?.balance));

  const isPolling = $derived(
    $generationStore.jobStatus !== null &&
      $generationStore.jobStatus !== 'completed' &&
      $generationStore.jobStatus !== 'failed' &&
      $generationStore.jobStatus !== 'cancelled' &&
      $generationStore.jobStatus !== 'moderated',
  );

  const isTopUpMode = $derived(!hasBalance && !balanceQuery.isLoading);

  const disabled = $derived(
    isTopUpMode
      ? false
      : externalDisabled || !$generationStore.prompt.trim() || submitting || isPolling,
  );

  const label = $derived(
    isTopUpMode
      ? m.generate_btn_topup()
      : submitting
        ? m.create_submitting()
        : isPolling
          ? m.create_generating()
          : m.create_generate(),
  );

  const progress = $derived($generationStore.progress);

  function handleClick() {
    if (isTopUpMode) {
      goto('/app/billing/buy');
    } else {
      onclick();
    }
  }
</script>

<button
  onclick={handleClick}
  {disabled}
  class="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3.5 text-sm font-bold text-white transition-opacity
    {disabled ? 'cursor-not-allowed opacity-40' : 'hover:opacity-90'}"
  style="background: linear-gradient(135deg, var(--apex-accent-dim), var(--apex-accent));"
>
  {#if isPolling && progress !== null && progress < 100}
    <!-- SSE progress bar -->
    <span
      class="absolute bottom-0 left-0 h-1 rounded-bl-xl bg-white/40 transition-all duration-300"
      style="width: {progress}%"
    ></span>
  {:else if isPolling}
    <!-- Animated shimmer fallback when no progress data -->
    <span
      class="absolute inset-0 animate-pulse opacity-20"
      style="background: linear-gradient(90deg, transparent, white, transparent); background-size: 200% 100%;"
    ></span>
  {/if}
  <span>{label}</span>
  {#if !isTopUpMode}
    <CostPreview {estimatedCost} />
  {/if}
</button>
