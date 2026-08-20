<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from '@lucide/svelte';
  import * as m from '$paraglide/messages';
  import { formatNumber } from '$lib/utils/format';
  import { createSupportedModes } from '$lib/utils/generationModes';
  import { generationModeLabel } from '$lib/content/generationModeLabels';
  import { getEditAspectRatios, getT2iAspectRatios } from '$lib/utils/modelCapabilities';
  import type { components } from '$lib/api/types';
  import type { ModelBillingFacts } from '$lib/content/modelGuides/billingFacts';
  import type { ModelGuide, ModelGuideExample } from '$lib/content/modelGuides/types';
  import ModelGuideExamples from './ModelGuideExamples.svelte';
  import ModelGuideSectionList from './ModelGuideSectionList.svelte';

  type ModelInfo = components['schemas']['ModelInfo'];
  type ModelType = components['schemas']['ModelType'];

  interface Props {
    modelInfo: ModelInfo;
    guide: ModelGuide | null;
    billingFacts: ModelBillingFacts;
    pricingPending: boolean;
    onclose: () => void;
    onuseexample: (modelKey: ModelType, example: ModelGuideExample) => void;
  }

  let { modelInfo, guide, billingFacts, pricingPending, onclose, onuseexample }: Props = $props();
  let closeButton = $state<HTMLButtonElement | null>(null);
  let dialogPanel = $state<HTMLDivElement | null>(null);

  const description = $derived(guide?.tagline() || modelInfo.description);
  const modes = $derived(createSupportedModes(modelInfo));
  const actionableExamples = $derived(
    (guide?.examples ?? []).filter((example) => modes.includes(example.mode)),
  );
  const capabilityRows = $derived.by(() => {
    const rows: { label: string; value: string }[] = [];
    if (modes.length > 0)
      rows.push({
        label: m.model_guide_cap_modes(),
        value: modes.map(generationModeLabel).join(', '),
      });
    if (modelInfo.max_images != null) {
      rows.push({ label: m.model_guide_cap_max_outputs(), value: String(modelInfo.max_images) });
    }
    if (modelInfo.max_prompt_length != null) {
      rows.push({
        label: m.model_guide_cap_max_prompt(),
        value: formatNumber(modelInfo.max_prompt_length),
      });
    }
    if (modelInfo.video) {
      rows.push({
        label: m.model_guide_cap_max_duration(),
        value: `${modelInfo.video.max_duration} ${m.model_guide_seconds()}`,
      });
      rows.push({
        label: m.model_guide_cap_resolutions(),
        value: modelInfo.video.resolutions.join(', '),
      });
    }
    rows.push({
      label: m.model_guide_cap_negative_prompt(),
      value: modelInfo.supports_negative_prompt
        ? m.model_guide_supported()
        : m.model_guide_not_supported(),
    });
    const t2iAspectRatios = getT2iAspectRatios(modelInfo);
    if (modes.includes('t2i') && t2iAspectRatios.length > 0) {
      rows.push({
        label: m.model_guide_cap_t2i_aspect_ratios(),
        value: t2iAspectRatios.join(', '),
      });
    }
    if (modes.includes('i2i')) {
      const editAspectRatios = getEditAspectRatios(modelInfo);
      rows.push({
        label: m.model_guide_cap_i2i_aspect(),
        value:
          editAspectRatios.length > 0
            ? m.model_guide_cap_i2i_auto_with_ratios({ ratios: editAspectRatios.join(', ') })
            : m.model_guide_cap_i2i_preserve_source(),
      });
    }
    rows.push({
      label: m.model_guide_cap_age_gate(),
      value: modelInfo.requires_age_verification
        ? m.model_guide_age_required()
        : m.model_guide_age_not_required(),
    });
    return rows;
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusableControls = getFocusableControls();
    if (focusableControls.length === 0) return;

    const first = focusableControls[0];
    const last = focusableControls[focusableControls.length - 1];
    if (!dialogPanel?.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function getFocusableControls(): HTMLElement[] {
    if (!dialogPanel) return [];
    return Array.from(
      dialogPanel.querySelectorAll<HTMLElement>(
        'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        !element.hidden &&
        element.tabIndex >= 0 &&
        getComputedStyle(element).visibility !== 'hidden' &&
        getComputedStyle(element).display !== 'none',
    );
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onclose();
  }

  function handleUseExample(example: ModelGuideExample) {
    if (!guide) return;
    onuseexample(guide.modelKey, example);
    onclose();
  }

  onMount(() => closeButton?.focus());
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="fixed inset-0 z-[160] flex items-end bg-black/50 md:items-center md:justify-center md:p-4"
  onclick={handleBackdropClick}
  role="presentation"
>
  <div
    bind:this={dialogPanel}
    role="dialog"
    aria-modal="true"
    aria-label={modelInfo.name}
    class="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-2xl md:max-h-[85dvh] md:max-w-lg md:rounded-2xl"
  >
    <header class="flex shrink-0 items-start gap-3 border-b border-border px-4 py-4">
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold text-text">{modelInfo.name}</h2>
        {#if description}
          <p class="mt-1 text-sm leading-relaxed text-text-dim">{description}</p>
        {/if}
      </div>
      <button
        bind:this={closeButton}
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        onclick={onclose}
        aria-label={m.model_guide_close()}
      >
        <X size={18} />
      </button>
    </header>

    <div class="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4">
      {#if guide}
        <ModelGuideSectionList title={m.model_guide_section_good_at()} items={guide.goodAt} />
        <ModelGuideSectionList
          title={m.model_guide_section_choose_when()}
          items={guide.chooseWhen}
        />
      {/if}

      <section>
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {m.model_guide_section_capabilities()}
        </h3>
        {#if capabilityRows.length > 0}
          <dl class="mt-2 divide-y divide-border rounded-xl border border-border bg-bg px-3">
            {#each capabilityRows as row (row.label)}
              <div class="flex items-start justify-between gap-4 py-2.5 text-sm">
                <dt class="shrink-0 text-text-dim">{row.label}</dt>
                <dd class="text-right font-medium text-text">{row.value}</dd>
              </div>
            {/each}
          </dl>
        {/if}
      </section>

      {#if guide}
        <ModelGuideSectionList
          title={m.model_guide_section_restrictions()}
          items={guide.restrictions}
        />
      {/if}

      <section>
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {m.model_guide_section_billing()}
        </h3>
        {#if billingFacts.costs.length > 0}
          <dl class="mt-2 divide-y divide-border rounded-xl border border-border bg-bg px-3">
            {#each billingFacts.costs as cost (cost.mode)}
              <div class="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt class="text-text-dim">{generationModeLabel(cost.mode)}</dt>
                <dd class="font-medium text-text">
                  {cost.tokenCost === null || cost.inputTokenCost === null
                    ? pricingPending
                      ? m.model_guide_cost_loading()
                      : m.model_guide_cost_unknown()
                    : cost.inputTokenCost > 0
                      ? m.model_guide_cost_with_input_per_output({
                          baseTokens: formatNumber(cost.tokenCost),
                          inputTokens: formatNumber(cost.inputTokenCost),
                        })
                      : m.model_guide_cost_per_output({ tokens: formatNumber(cost.tokenCost) })}
                </dd>
              </div>
            {/each}
          </dl>
        {/if}
        {#if billingFacts.billedBySession}
          <p
            class="mt-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm leading-relaxed text-text-dim"
          >
            {m.model_guide_billed_by_session()}
          </p>
        {/if}
        {#if guide}
          <ul class="mt-4 list-disc space-y-1 pl-4 text-sm leading-relaxed text-text-dim">
            {#each guide.billingRules as rule (rule)}
              <li>{rule()}</li>
            {/each}
          </ul>
        {/if}
      </section>

      {#if guide}
        <ModelGuideSectionList title={m.model_guide_section_tips()} items={guide.promptTips} />
        {#if actionableExamples.length > 0}
          <section>
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {m.model_guide_section_examples()}
            </h3>
            <div class="mt-2">
              <ModelGuideExamples examples={actionableExamples} onuse={handleUseExample} />
            </div>
          </section>
        {/if}
      {/if}
    </div>

    <footer
      class="shrink-0 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      <button
        type="button"
        class="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        onclick={onclose}>{m.model_guide_start_creating()}</button
      >
    </footer>
  </div>
</div>
