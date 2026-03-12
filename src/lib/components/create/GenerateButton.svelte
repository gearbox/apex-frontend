<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import CostPreview from './CostPreview.svelte';

  let { onclick, submitting = false }: { onclick: () => void; submitting?: boolean } = $props();

  const isPolling = $derived(
    $generationStore.jobStatus !== null &&
      $generationStore.jobStatus !== 'completed' &&
      $generationStore.jobStatus !== 'failed' &&
      $generationStore.jobStatus !== 'cancelled' &&
      $generationStore.jobStatus !== 'moderated',
  );

  const disabled = $derived(
    !$generationStore.prompt.trim() || submitting || isPolling,
  );

  const label = $derived(
    submitting ? 'Submitting…' : isPolling ? 'Generating…' : '✦ Generate',
  );
</script>

<button
  {onclick}
  {disabled}
  class="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3.5 text-sm font-bold text-white transition-opacity
    {disabled ? 'cursor-not-allowed opacity-40' : 'hover:opacity-90'}"
  style="background: linear-gradient(135deg, var(--apex-accent-dim), var(--apex-accent));"
>
  {#if isPolling}
    <!-- Animated progress bar overlay -->
    <span class="absolute inset-0 animate-pulse opacity-20" style="background: linear-gradient(90deg, transparent, white, transparent); background-size: 200% 100%;"></span>
  {/if}
  <span>{label}</span>
  <CostPreview />
</button>
