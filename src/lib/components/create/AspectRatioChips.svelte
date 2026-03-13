<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import type { components } from '$lib/api/types';

  type AspectRatio = components['schemas']['AspectRatio'];

  const RATIOS: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Aspect Ratio</span>
  <div class="flex flex-wrap gap-1">
    {#each RATIOS as ratio (ratio)}
      {@const isActive = $generationStore.aspectRatio === ratio}
      <button
        onclick={() => generationStore.setAspectRatio(ratio)}
        class="rounded-md border px-2 py-1.5 font-mono text-[11px] font-semibold transition-all
          {isActive
            ? 'border-accent-dim bg-accent-glow text-accent'
            : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
      >
        {ratio}
      </button>
    {/each}
  </div>
</div>
