<script lang="ts">
  import { generationStore } from '$lib/stores/generation';

  let { estimatedCost = 0 }: { estimatedCost?: number } = $props();

  const totalCost = $derived(
    estimatedCost *
      ($generationStore.mode === 't2i' || $generationStore.mode === 'i2i'
        ? $generationStore.imageCount
        : 1),
  );
</script>

<span class="font-mono text-xs opacity-70">◈ {totalCost || '?'}</span>
