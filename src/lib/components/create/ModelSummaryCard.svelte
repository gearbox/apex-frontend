<script lang="ts">
  import { tick } from 'svelte';
  import * as m from '$paraglide/messages';
  import { formatNumber } from '$lib/utils/format';
  import { isGenerationMode, type GenerationMode } from '$lib/utils/generationModes';
  import type { components } from '$lib/api/types';
  import type { ModelBillingFacts } from '$lib/content/modelGuides/billingFacts';
  import type { ModelGuide, ModelGuideExample } from '$lib/content/modelGuides/types';
  import ModelGuideSheet from './ModelGuideSheet.svelte';

  type ModelInfo = components['schemas']['ModelInfo'];
  type ModelType = components['schemas']['ModelType'];

  interface Props {
    modelInfo: ModelInfo | null;
    guide: ModelGuide | null;
    billingFacts: ModelBillingFacts;
    selectedMode: GenerationMode;
    onuseexample: (modelKey: ModelType, example: ModelGuideExample) => void;
  }

  let { modelInfo, guide, billingFacts, selectedMode, onuseexample }: Props = $props();
  let guideOpen = $state(false);
  let guideTrigger = $state<HTMLButtonElement | null>(null);

  const tagline = $derived(guide?.tagline() || modelInfo?.description || '');
  const selectedCost = $derived(
    billingFacts.costs.find((row) => row.mode === selectedMode)?.tokens ?? null,
  );
  const modes = $derived(
    (modelInfo?.capabilities ?? []).filter((capability): capability is GenerationMode =>
      isGenerationMode(capability),
    ),
  );
  const modeSummary = $derived(modes.map(modeLabel).join(', '));

  function modeLabel(mode: GenerationMode): string {
    const labels: Record<GenerationMode, () => string> = {
      t2i: m.model_guide_mode_t2i,
      i2i: m.model_guide_mode_i2i,
      t2v: m.model_guide_mode_t2v,
      i2v: m.model_guide_mode_i2v,
      v2v: m.model_guide_mode_v2v,
      flf2v: m.model_guide_mode_flf2v,
    };
    return labels[mode]();
  }

  function closeGuide() {
    guideOpen = false;
    void tick().then(() => guideTrigger?.focus());
  }
</script>

{#if modelInfo}
  <section class="rounded-2xl border border-border bg-surface p-3" aria-label={modelInfo.name}>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold text-text">{modelInfo.name}</h2>
        {#if tagline}
          <p class="mt-1 text-xs leading-relaxed text-text-dim">{tagline}</p>
        {/if}
      </div>
      <span class="shrink-0 rounded-full bg-bg px-2 py-1 text-[11px] font-semibold text-text-muted">
        {selectedCost === null
          ? m.model_guide_cost_unknown()
          : m.model_guide_cost_per_mode({ tokens: formatNumber(selectedCost) })}
      </span>
    </div>

    <div class="mt-3 flex flex-wrap gap-1.5">
      {#if modeSummary}
        <span class="rounded-full bg-surface-hover px-2 py-1 text-[11px] text-text-dim"
          >{m.model_guide_cap_modes()}: {modeSummary}</span
        >
      {/if}
      <span class="rounded-full bg-surface-hover px-2 py-1 text-[11px] text-text-dim"
        >{m.model_guide_cap_max_outputs()}: {modelInfo.max_images}</span
      >
      {#if modelInfo.supports_negative_prompt}
        <span class="rounded-full bg-surface-hover px-2 py-1 text-[11px] text-text-dim"
          >{m.model_guide_cap_negative_prompt()}</span
        >
      {/if}
      {#if modelInfo.requires_age_verification}
        <span class="rounded-full bg-surface-hover px-2 py-1 text-[11px] text-text-dim">18+</span>
      {/if}
    </div>

    <button
      bind:this={guideTrigger}
      type="button"
      class="mt-3 text-xs font-semibold text-accent hover:underline"
      aria-haspopup="dialog"
      aria-expanded={guideOpen}
      onclick={() => (guideOpen = true)}>{m.model_guide_learn_more()}</button
    >
  </section>

  {#if guideOpen}
    <ModelGuideSheet {modelInfo} {guide} {billingFacts} onclose={closeGuide} {onuseexample} />
  {/if}
{/if}
