<script lang="ts">
  import type { components } from '$lib/api/types';
  import { generationStore } from '$lib/stores/generation';
  import { getVideoConstraints, normalizeVideoParams } from '$lib/utils/videoParams';

  type ModelInfo = components['schemas']['ModelInfo'];

  let { modelInfo }: { modelInfo: ModelInfo | null } = $props();

  const constraints = $derived(getVideoConstraints(modelInfo));

  $effect(() => {
    const normalized = normalizeVideoParams(
      modelInfo,
      $generationStore.videoDuration,
      $generationStore.videoResolution,
    );
    if (normalized.duration !== $generationStore.videoDuration) {
      generationStore.setVideoDuration(normalized.duration);
    }
    if (normalized.resolution !== $generationStore.videoResolution) {
      generationStore.setVideoResolution(normalized.resolution);
    }
  });
</script>

<div class="flex flex-col gap-3">
  <!-- Duration slider -->
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
        >Duration</span
      >
      <span class="font-mono text-xs font-semibold text-accent"
        >{$generationStore.videoDuration}s</span
      >
    </div>
    <input
      type="range"
      min="1"
      max={constraints.maxDuration}
      step="1"
      value={$generationStore.videoDuration}
      oninput={(e) =>
        generationStore.setVideoDuration(parseInt((e.target as HTMLInputElement).value))}
      class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
    />
    <div class="flex justify-between text-[10px] text-text-dim">
      <span>1s</span>
      <span>{constraints.maxDuration}s</span>
    </div>
  </div>

  <!-- Resolution toggle -->
  <div class="flex flex-col gap-2">
    <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
      >Resolution</span
    >
    <div class="flex gap-1.5">
      {#each constraints.resolutions as res (res)}
        {@const isActive = $generationStore.videoResolution === res}
        <button
          onclick={() => generationStore.setVideoResolution(res)}
          class="flex-1 rounded-lg border py-2 text-xs font-semibold transition-all
            {isActive
            ? 'border-accent-dim bg-accent-glow text-accent'
            : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
        >
          {res}
        </button>
      {/each}
    </div>
  </div>
</div>
