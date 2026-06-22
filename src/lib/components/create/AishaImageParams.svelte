<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { ChevronDown } from 'lucide-svelte';
  import type { components } from '$lib/api/types';

  type ModelInfo = components['schemas']['ModelInfo'];
  type Resolution = components['schemas']['Resolution'];
  type Sampler = components['schemas']['Sampler'];
  type Scheduler = components['schemas']['Scheduler'];

  const SAMPLERS: Sampler[] = [
    'euler',
    'euler_ancestral',
    'euler_cfg_pp',
    'heun',
    'dpm_2',
    'dpm_2_ancestral',
    'lms',
    'dpmpp_2s_ancestral',
    'dpmpp_sde',
    'dpmpp_2m',
    'dpmpp_2m_sde',
    'dpmpp_3m_sde',
    'ddim',
    'uni_pc',
    'uni_pc_bh2',
    'lcm',
    'res_multistep',
  ];

  const SCHEDULERS: Scheduler[] = [
    'normal',
    'karras',
    'exponential',
    'sgm_uniform',
    'simple',
    'ddim_uniform',
    'beta',
    'linear_quadratic',
    'kl_optimal',
  ];

  const FALLBACK_TIERS: Resolution[] = ['draft', 'standard', 'high', 'ultra'];

  let { modelInfo }: { modelInfo: ModelInfo } = $props();

  let advancedOpen = $state(false);

  const minDim = $derived(modelInfo.image?.min_height ?? 256);
  const maxDim = $derived(modelInfo.image?.max_height ?? 4096);

  const tiers = $derived((modelInfo.image?.supported_tiers ?? FALLBACK_TIERS) as Resolution[]);
  const defaultTier = $derived(modelInfo.image?.default_tier ?? null);

  const sizingMode = $derived($generationStore.sizingMode);
  const imageTier = $derived($generationStore.imageTier);
  const customWidth = $derived($generationStore.customWidth);
  const customHeight = $derived($generationStore.customHeight);

  const showHalfPairHint = $derived(
    sizingMode === 'custom' &&
      ((customWidth !== null && customHeight === null) ||
        (customWidth === null && customHeight !== null)),
  );
</script>

<div class="flex flex-col gap-3">
  <!-- Sizing mode toggle -->
  <div class="flex flex-col gap-2">
    <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
      >Image Size</span
    >
    <div class="flex gap-1.5">
      {#each ['tier', 'custom'] as const as mode (mode)}
        {@const isActive = sizingMode === mode}
        <button
          onclick={() => generationStore.setSizingMode(mode)}
          aria-pressed={isActive}
          class="flex-1 rounded-lg border py-2 text-xs font-semibold transition-all
            {isActive
            ? 'border-accent-dim bg-accent-glow text-accent'
            : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
        >
          {mode === 'tier' ? 'Quality Tier' : 'Custom Size'}
        </button>
      {/each}
    </div>
  </div>

  <!-- Tier mode -->
  {#if sizingMode === 'tier'}
    <div class="flex flex-wrap gap-1">
      <!-- Default chip (clears tier) -->
      <button
        onclick={() => generationStore.setImageTier(null)}
        aria-pressed={imageTier === null}
        class="rounded-md border px-2 py-1.5 text-xs font-semibold transition-all
          {imageTier === null
          ? 'border-accent-dim bg-accent-glow text-accent'
          : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
      >
        Default
      </button>
      {#each tiers as tier (tier)}
        {@const isActive = imageTier === tier}
        {@const isDefault = defaultTier === tier}
        <button
          onclick={() => generationStore.setImageTier(tier)}
          aria-pressed={isActive}
          class="rounded-md border px-2 py-1.5 text-xs font-semibold transition-all
            {isActive
            ? 'border-accent-dim bg-accent-glow text-accent'
            : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
        >
          {tier}{isDefault ? ' ★' : ''}
        </button>
      {/each}
    </div>

    <!-- Custom size mode -->
  {:else}
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <div class="flex flex-1 flex-col gap-1">
          <label
            for="aisha-custom-width"
            class="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Width</label
          >
          <input
            id="aisha-custom-width"
            type="number"
            min={minDim}
            max={maxDim}
            step="8"
            placeholder="e.g. 1024"
            value={customWidth ?? ''}
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              generationStore.setCustomSize(
                v ? parseInt(v, 10) : null,
                $generationStore.customHeight,
                minDim,
                maxDim,
              );
            }}
            class="w-full rounded-2.5 border border-border bg-surface px-3 py-2 text-xs text-text-muted placeholder:text-text-dim focus:border-accent focus:outline-none transition-colors"
          />
        </div>
        <div class="flex flex-1 flex-col gap-1">
          <label
            for="aisha-custom-height"
            class="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Height</label
          >
          <input
            id="aisha-custom-height"
            type="number"
            min={minDim}
            max={maxDim}
            step="8"
            placeholder="e.g. 1024"
            value={customHeight ?? ''}
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              generationStore.setCustomSize(
                $generationStore.customWidth,
                v ? parseInt(v, 10) : null,
                minDim,
                maxDim,
              );
            }}
            class="w-full rounded-2.5 border border-border bg-surface px-3 py-2 text-xs text-text-muted placeholder:text-text-dim focus:border-accent focus:outline-none transition-colors"
          />
        </div>
      </div>
      {#if showHalfPairHint}
        <p class="text-[11px] text-warning">Width and height are required together.</p>
      {/if}
    </div>
  {/if}

  <!-- Advanced collapsible -->
  <div class="flex flex-col gap-1">
    <button
      onclick={() => (advancedOpen = !advancedOpen)}
      aria-expanded={advancedOpen}
      class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-text-dim hover:text-text-muted transition-colors"
    >
      <span>Advanced</span>
      <ChevronDown size={12} class="transition-transform {advancedOpen ? 'rotate-180' : ''}" />
    </button>

    {#if advancedOpen}
      <div class="flex flex-col gap-3 pt-1">
        <!-- Seed -->
        <div class="flex flex-col gap-1">
          <label
            for="aisha-seed"
            class="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Seed</label
          >
          <input
            id="aisha-seed"
            type="number"
            min="0"
            placeholder="Auto"
            value={$generationStore.seed ?? ''}
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              generationStore.setSeed(v ? parseInt(v, 10) : null);
            }}
            class="w-full rounded-2.5 border border-border bg-surface px-3 py-2 text-xs text-text-muted placeholder:text-text-dim focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        <!-- Steps -->
        <div class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between">
            <label
              for="aisha-steps"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Steps</label
            >
            <span class="font-mono text-xs font-semibold text-accent">
              {$generationStore.steps ?? 'Auto'}
            </span>
          </div>
          <input
            id="aisha-steps"
            type="range"
            min="1"
            max="150"
            step="1"
            value={$generationStore.steps ?? 20}
            oninput={(e) =>
              generationStore.setSteps(parseInt((e.target as HTMLInputElement).value, 10))}
            class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
          />
          <div class="flex justify-between text-[10px] text-text-dim">
            <span>1</span>
            <span>150</span>
          </div>
          {#if $generationStore.steps !== null}
            <button
              onclick={() => generationStore.setSteps(null)}
              class="self-start text-[10px] text-text-dim hover:text-text-muted transition-colors"
            >
              Reset to Auto
            </button>
          {/if}
        </div>

        <!-- CFG -->
        <div class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between">
            <label
              for="aisha-cfg"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-dim"
              >CFG Scale</label
            >
            <span class="font-mono text-xs font-semibold text-accent">
              {$generationStore.cfg ?? 'Auto'}
            </span>
          </div>
          <input
            id="aisha-cfg"
            type="range"
            min="0"
            max="30"
            step="0.5"
            value={$generationStore.cfg ?? 7}
            oninput={(e) =>
              generationStore.setCfg(parseFloat((e.target as HTMLInputElement).value))}
            class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
          />
          <div class="flex justify-between text-[10px] text-text-dim">
            <span>0</span>
            <span>30</span>
          </div>
          {#if $generationStore.cfg !== null}
            <button
              onclick={() => generationStore.setCfg(null)}
              class="self-start text-[10px] text-text-dim hover:text-text-muted transition-colors"
            >
              Reset to Auto
            </button>
          {/if}
        </div>

        <!-- Sampler -->
        <div class="flex flex-col gap-1">
          <label
            for="aisha-sampler"
            class="text-[10px] font-semibold uppercase tracking-wider text-text-dim">Sampler</label
          >
          <select
            id="aisha-sampler"
            value={$generationStore.sampler ?? ''}
            onchange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              generationStore.setSampler(v ? (v as Sampler) : null);
            }}
            class="w-full rounded-2.5 border border-border bg-surface px-3 py-2 text-xs text-text-muted focus:border-accent focus:outline-none transition-colors"
          >
            <option value="">Auto</option>
            {#each SAMPLERS as s (s)}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </div>

        <!-- Scheduler -->
        <div class="flex flex-col gap-1">
          <label
            for="aisha-scheduler"
            class="text-[10px] font-semibold uppercase tracking-wider text-text-dim"
            >Scheduler</label
          >
          <select
            id="aisha-scheduler"
            value={$generationStore.scheduler ?? ''}
            onchange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              generationStore.setScheduler(v ? (v as Scheduler) : null);
            }}
            class="w-full rounded-2.5 border border-border bg-surface px-3 py-2 text-xs text-text-muted focus:border-accent focus:outline-none transition-colors"
          >
            <option value="">Auto</option>
            {#each SCHEDULERS as sc (sc)}
              <option value={sc}>{sc}</option>
            {/each}
          </select>
        </div>

        <!-- Denoise -->
        <div class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between">
            <label
              for="aisha-denoise"
              class="text-[10px] font-semibold uppercase tracking-wider text-text-dim"
              >Denoise</label
            >
            <span class="font-mono text-xs font-semibold text-accent">
              {$generationStore.denoise ?? 'Auto'}
            </span>
          </div>
          <input
            id="aisha-denoise"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={$generationStore.denoise ?? 1}
            oninput={(e) =>
              generationStore.setDenoise(parseFloat((e.target as HTMLInputElement).value))}
            class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
          />
          <div class="flex justify-between text-[10px] text-text-dim">
            <span>0</span>
            <span>1</span>
          </div>
          {#if $generationStore.denoise !== null}
            <button
              onclick={() => generationStore.setDenoise(null)}
              class="self-start text-[10px] text-text-dim hover:text-text-muted transition-colors"
            >
              Reset to Auto
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
