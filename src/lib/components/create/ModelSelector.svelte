<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import type { components } from '$lib/api/types';

  type ModelType = components['schemas']['ModelType'];
  type GrokModelInfo = components['schemas']['GrokModelInfo'];

  let { models = [] }: { models: GrokModelInfo[] } = $props();

  const MODEL_META: Record<ModelType, { label: string; icon: string }> = {
    'grok-imagine-image': { label: 'Grok Imagine', icon: '✦' },
    'grok-2-image-1212': { label: 'Grok 2', icon: '◈' },
    'grok-imagine-video': { label: 'Grok Video', icon: '▶' },
    'aisha': { label: 'Aisha', icon: '◆' },
  };

  const grokModels = $derived(
    models.length > 0
      ? models.map((m) => m.model).filter((m): m is ModelType => m in MODEL_META)
      : (['grok-imagine-image', 'grok-2-image-1212', 'grok-imagine-video'] as ModelType[]),
  );
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">Model</span>
  <div class="flex gap-1.5">
    {#each grokModels as modelId (modelId)}
      {@const meta = MODEL_META[modelId]}
      {@const isActive = $generationStore.model === modelId}
      <button
        onclick={() => generationStore.setModel(modelId)}
        class="flex flex-1 flex-col items-center gap-1 rounded-[10px] border py-2.5 text-xs font-medium transition-all
          {isActive
            ? 'border-accent-dim bg-accent-glow text-accent'
            : 'border-border bg-surface text-text-muted hover:border-border-active hover:text-text'}"
      >
        <span class="text-base leading-none">{meta.icon}</span>
        <span>{meta.label}</span>
      </button>
    {/each}
  </div>
</div>
