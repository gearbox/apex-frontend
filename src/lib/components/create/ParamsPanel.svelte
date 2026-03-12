<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import AspectRatioChips from './AspectRatioChips.svelte';
  import ImageCountStepper from './ImageCountStepper.svelte';
  import VideoParams from './VideoParams.svelte';

  const isVideo = $derived($generationStore.mode === 't2v' || $generationStore.mode === 'i2v');
</script>

{#if isVideo}
  <VideoParams />
{:else}
  <div class="grid grid-cols-2 gap-3">
    <AspectRatioChips />
    <ImageCountStepper />
  </div>
{/if}
