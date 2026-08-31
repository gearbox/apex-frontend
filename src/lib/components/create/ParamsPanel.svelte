<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import type { components } from '$lib/api/types';
  import { isVideoMode } from '$lib/utils/generationModes';
  import {
    isGenerationParameterSupported,
    supportsAnyGenerationParameter,
  } from '$lib/utils/modelCapabilities';
  import AspectRatioChips from './AspectRatioChips.svelte';
  import ImageCountStepper from './ImageCountStepper.svelte';
  import VideoParams from './VideoParams.svelte';
  import WorkflowImageParams from './WorkflowImageParams.svelte';

  type ModelInfo = components['schemas']['ModelInfo'];

  let {
    modelInfo,
    aspectError = null,
  }: { modelInfo: ModelInfo | null; aspectError?: string | null } = $props();

  const isVideo = $derived(isVideoMode($generationStore.mode));
  const showWorkflowParams = $derived(
    !isVideo &&
      supportsAnyGenerationParameter(modelInfo, [
        'image_resolution',
        'width',
        'height',
        'seed',
        'steps',
        'cfg',
        'sampler',
        'scheduler',
        'denoise',
      ]),
  );
  const showAspectRatio = $derived(isGenerationParameterSupported(modelInfo, 'aspect_ratio'));
  const showImageCount = $derived(
    !isVideo && isGenerationParameterSupported(modelInfo, 'batch_size'),
  );
</script>

{#if isVideo}
  <VideoParams {modelInfo} />
{:else}
  <div class="flex flex-col gap-3">
    {#if showAspectRatio}
      <AspectRatioChips {modelInfo} {aspectError} />
    {/if}
    {#if showImageCount}
      <ImageCountStepper {modelInfo} />
    {/if}
    {#if showWorkflowParams && modelInfo}
      <WorkflowImageParams {modelInfo} />
    {/if}
  </div>
{/if}
