<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
</script>

<div class="flex flex-col gap-3">
  <!-- Duration slider -->
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Duration</span>
      <span class="font-mono text-xs font-semibold text-accent">{$generationStore.videoDuration}s</span>
    </div>
    <input
      type="range"
      min="1"
      max="15"
      step="1"
      value={$generationStore.videoDuration}
      oninput={(e) => generationStore.setVideoDuration(parseInt((e.target as HTMLInputElement).value))}
      class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
    />
    <div class="flex justify-between text-[10px] text-text-dim">
      <span>1s</span>
      <span>15s</span>
    </div>
  </div>

  <!-- Resolution toggle -->
  <div class="flex flex-col gap-2">
    <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Resolution</span>
    <div class="flex gap-1.5">
      {#each ['480p', '720p'] as res (res)}
        {@const isActive = $generationStore.videoResolution === res}
        <button
          onclick={() => generationStore.setVideoResolution(res as '480p' | '720p')}
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
