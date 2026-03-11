<script lang="ts">
  // Phase 2: ModelSelector, TypeSelector, PromptInput, ParamsPanel, GenerateButton, ResultsPanel
</script>

<svelte:head>
  <title>Create — Apex</title>
</svelte:head>

<!-- Desktop: side-by-side panels. Mobile: single-column scroll. -->
<div class="flex flex-col md:h-full md:flex-row md:gap-6">
  <!-- Controls column -->
  <div class="flex flex-col gap-4 p-4 md:w-[400px] md:shrink-0 md:overflow-y-auto md:p-0 md:pb-5">

    <!-- Model -->
    <div class="flex flex-col gap-2">
      <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">Model</span>
      <div class="flex gap-1.5">
        {#each [{ name: 'Imagine', icon: '✦', active: true }, { name: 'Grok 2', icon: '◈', active: false }, { name: 'Video', icon: '▶', active: false }] as model (model.name)}
          <button
            disabled
            class="flex flex-1 flex-col items-center gap-1 rounded-[10px] border py-2.5 text-xs font-medium transition-all
              {model.active
                ? 'border-accent-dim bg-accent-glow text-accent'
                : 'border-border bg-surface text-text-muted'}"
          >
            <span class="text-base leading-none">{model.icon}</span>
            <span>{model.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Type -->
    <div class="flex flex-col gap-2">
      <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">Type</span>
      <div class="flex gap-1.5">
        {#each [{ label: 'Text→Image', active: true }, { label: 'Img→Image', active: false }] as type (type.label)}
          <button
            disabled
            class="flex-1 rounded-lg border py-2 text-center text-xs font-medium transition-all
              {type.active
                ? 'border-accent-dim bg-accent-glow text-accent'
                : 'border-border text-text-muted'}"
          >
            {type.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Prompt -->
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">Prompt</span>
        <span class="font-mono text-[11px] text-text-dim">0/4096</span>
      </div>
      <textarea
        disabled
        rows={4}
        placeholder="Describe what you want to create…"
        class="w-full resize-none rounded-[10px] border border-border bg-surface p-3 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
      ></textarea>
    </div>

    <!-- Parameters -->
    <div class="grid grid-cols-2 gap-3">
      <!-- Aspect Ratio -->
      <div class="flex flex-col gap-2">
        <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">Aspect Ratio</span>
        <div class="flex flex-wrap gap-1">
          {#each ['1:1', '16:9', '9:16', '4:3', '3:4'] as ratio (ratio)}
            <button
              disabled
              class="rounded-md border px-2 py-1.5 font-mono text-[11px] font-semibold transition-all
                {ratio === '1:1'
                  ? 'border-accent-dim bg-accent-glow text-accent'
                  : 'border-border text-text-muted'}"
            >
              {ratio}
            </button>
          {/each}
        </div>
      </div>

      <!-- Images count -->
      <div class="flex flex-col gap-2">
        <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">Images</span>
        <div class="flex gap-1">
          {#each [1, 2, 3, 4] as n (n)}
            <button
              disabled
              class="flex-1 rounded-lg border py-2 font-mono text-sm font-semibold transition-all
                {n === 1
                  ? 'border-accent-dim bg-accent-glow text-accent'
                  : 'border-border text-text-muted'}"
            >
              {n}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Results placeholder (mobile only, inside scroll) -->
    <div
      class="mb-2 flex min-h-[200px] items-center justify-center rounded-xl border border-border md:hidden"
      style="background: radial-gradient(ellipse at center, color-mix(in srgb, var(--apex-accent-dim) 8%, transparent), transparent 70%);"
    >
      <div class="p-5 text-center">
        <div class="mb-2 text-4xl opacity-25">✦</div>
        <p class="text-sm text-text-muted">Results appear here</p>
      </div>
    </div>

    <!-- Generate button (desktop, inline at bottom of controls) -->
    <button
      disabled
      class="hidden w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white md:flex"
      style="background: linear-gradient(135deg, var(--apex-accent-dim), var(--apex-accent)); opacity: 0.4; cursor: not-allowed;"
    >
      ✦ Generate <span class="font-mono text-xs opacity-70">◈ 5</span>
    </button>
  </div>

  <!-- Results panel (desktop only) -->
  <div
    class="hidden flex-1 items-center justify-center rounded-2xl border border-border md:flex"
    style="background: radial-gradient(ellipse at center, color-mix(in srgb, var(--apex-accent-dim) 8%, transparent), transparent 70%);"
  >
    <div class="max-w-[280px] p-5 text-center">
      <div class="mb-4 text-5xl opacity-30">✦</div>
      <p class="text-sm leading-relaxed text-text-muted">Your generated content will appear here</p>
    </div>
  </div>
</div>

<!-- Generate button (mobile sticky bar, outside scroll column) -->
<div class="sticky bottom-0 border-t border-border bg-bg p-4 md:hidden">
  <button
    disabled
    class="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white"
    style="background: linear-gradient(135deg, var(--apex-accent-dim), var(--apex-accent)); opacity: 0.4; cursor: not-allowed;"
  >
    ✦ Generate <span class="font-mono text-xs opacity-70">◈ 5</span>
  </button>
</div>
