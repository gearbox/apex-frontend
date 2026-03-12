<script lang="ts">
  import { generationStore } from '$lib/stores/generation';

  const totalCost = $derived(
    $generationStore.estimatedCost *
      ($generationStore.mode === 't2i' || $generationStore.mode === 'i2i'
        ? $generationStore.imageCount
        : 1),
  );
</script>

<span class="font-mono text-xs opacity-70">◈ {totalCost || '?'}</span>
