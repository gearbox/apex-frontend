<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';
  import { generationModeLabel } from '$lib/content/generationModeLabels';
  import { CREATE_SUPPORTED_MODES, createSupportedModes } from '$lib/utils/generationModes';

  type ModelInfo = components['schemas']['ModelInfo'];

  let { modelInfo }: { modelInfo: ModelInfo | null } = $props();

  const supportedModes = $derived(
    modelInfo
      ? createSupportedModes(modelInfo).map((value) => ({
          value,
          label: generationModeLabel(value),
        }))
      : CREATE_SUPPORTED_MODES.filter((mode) => mode === 't2i' || mode === 'i2i').map((value) => ({
          value,
          label: generationModeLabel(value),
        })),
  );

  // When model changes, ensure current mode is still supported
  $effect(() => {
    const modes = supportedModes;
    if (modes.length && !modes.find((m) => m.value === $generationStore.mode)) {
      generationStore.setMode(modes[0].value);
    }
  });
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
    >{m.create_type_label()}</span
  >
  <div class="flex flex-wrap gap-1.5">
    {#each supportedModes as modeOpt (modeOpt.value)}
      {@const isActive = $generationStore.mode === modeOpt.value}
      <button
        onclick={() => generationStore.setMode(modeOpt.value)}
        class="flex-1 rounded-lg border py-2 text-center text-xs font-medium transition-all
          {isActive
          ? 'border-accent-dim bg-accent-glow text-accent'
          : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
      >
        {modeOpt.label}
      </button>
    {/each}
  </div>
</div>
