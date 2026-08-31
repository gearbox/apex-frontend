<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type ModelInfo = components['schemas']['ModelInfo'];
  let { modelInfo }: { modelInfo: ModelInfo | null } = $props();
  const counts = $derived(
    Array.from({ length: Math.max(1, modelInfo?.max_images ?? 1) }, (_, i) => i + 1),
  );
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
    >{m.create_images_count_label()}</span
  >
  <div class="flex gap-1">
    {#each counts as n (n)}
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
