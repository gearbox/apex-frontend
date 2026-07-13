<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import type { components } from '$lib/api/types';
  import { supportsAishaImageParams } from '$lib/utils/modelCapabilities';
  import AspectRatioChips from './AspectRatioChips.svelte';
  import ImageCountStepper from './ImageCountStepper.svelte';
  import VideoParams from './VideoParams.svelte';
  import AishaImageParams from './AishaImageParams.svelte';

  type ModelInfo = components['schemas']['ModelInfo'];

  let {
    modelInfo,
    aspectError = null,
  }: { modelInfo: ModelInfo | null; aspectError?: string | null } = $props();

  const isVideo = $derived($generationStore.mode === 't2v' || $generationStore.mode === 'i2v');
  const showAishaParams = $derived(!isVideo && supportsAishaImageParams(modelInfo));
</script>

{#if isVideo}
  <VideoParams />
{:else}
  <div class="flex flex-col gap-3">
    <AspectRatioChips {modelInfo} {aspectError} />
    <ImageCountStepper />
    {#if showAishaParams && modelInfo}
      <AishaImageParams {modelInfo} />
    {/if}
  </div>
{/if}
