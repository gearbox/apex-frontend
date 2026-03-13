<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Images</span>
  <div class="flex gap-1">
    {#each [1, 2, 3, 4] as n (n)}
      {@const isActive = $generationStore.imageCount === n}
      <button
        onclick={() => generationStore.setImageCount(n)}
        class="flex-1 rounded-lg border py-2 font-mono text-sm font-semibold transition-all
          {isActive
            ? 'border-accent-dim bg-accent-glow text-accent'
            : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
      >
        {n}
      </button>
    {/each}
  </div>
</div>
