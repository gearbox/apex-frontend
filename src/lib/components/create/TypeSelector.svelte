<script lang="ts">
  import { generationStore, type GenerationMode } from '$lib/stores/generation';
  import type { components } from '$lib/api/types';

  type GrokModelInfo = components['schemas']['GrokModelInfo'];

  let { modelInfo }: { modelInfo: GrokModelInfo | null } = $props();

  interface ModeOption {
    value: GenerationMode;
    label: string;
    requiresImage: boolean;
  }

  const ALL_MODES: ModeOption[] = [
    { value: 't2i', label: 'Text → Image', requiresImage: false },
    { value: 'i2i', label: 'Image → Image', requiresImage: true },
    { value: 't2v', label: 'Text → Video', requiresImage: false },
    { value: 'i2v', label: 'Image → Video', requiresImage: true },
  ];

  const supportedModes = $derived(
    modelInfo
      ? ALL_MODES.filter((m) => {
          if (m.value === 't2i') return modelInfo.supports_t2i;
          if (m.value === 'i2i') return modelInfo.supports_i2i;
          if (m.value === 't2v') return modelInfo.supports_t2v;
          if (m.value === 'i2v') return modelInfo.supports_i2v;
          return false;
        })
      : ALL_MODES.filter((m) => m.value === 't2i' || m.value === 'i2i'),
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
  <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">Type</span>
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
