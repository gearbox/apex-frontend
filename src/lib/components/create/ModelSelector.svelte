<script lang="ts">
  import type { components } from '$lib/api/types';
  import { modelPresentation } from '$lib/content/modelPresentation';

  type ModelType = components['schemas']['ModelType'];
  type ModelInfo = components['schemas']['ModelInfo'];

  interface Props {
    models: ModelInfo[];
    selectedModel: ModelType;
    onSelect: (key: ModelType) => void;
  }

  let { models = [], selectedModel, onSelect }: Props = $props();
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Model</span>
  <div class="flex gap-1.5">
    {#each models as model (model.model_key)}
      {@const meta = modelPresentation(model.model_key, model.name)}
      {@const isActive = selectedModel === model.model_key}
      <button
        onclick={() => onSelect(model.model_key as ModelType)}
        disabled={!model.is_enabled}
        aria-disabled={!model.is_enabled}
        class="flex flex-1 flex-col items-center gap-1 rounded-2.5 border py-2.5 text-xs font-medium transition-all
          {isActive
          ? 'border-accent-dim bg-accent-glow text-accent'
          : model.is_enabled
            ? 'border-border bg-surface text-text-muted hover:border-border-active hover:text-text'
            : 'cursor-not-allowed border-border bg-surface text-text-dim opacity-60'}"
      >
        <span class="text-base leading-none">{meta.icon}</span>
        <span>{meta.label}{model.is_enabled ? '' : ' (Unavailable)'}</span>
      </button>
    {/each}
  </div>
</div>
