<script lang="ts">
  // Phase 2: ModelSelector, TypeSelector, PromptInput, ParamsPanel, GenerateButton, ResultsPanel
</script>

<svelte:head>
  <title>Create — Apex</title>
</svelte:head>

<div class="flex flex-col gap-4 p-4 md:h-full md:flex-row md:gap-6 md:p-0">
  <!-- Controls Panel -->
  <div class="flex flex-col gap-4 md:w-100 md:shrink-0 md:overflow-y-auto md:pb-5">
    <h1 class="text-xl font-semibold text-text">Generation Studio</h1>

    <!-- Model Selector Placeholder -->
    <div class="rounded-xl border border-border bg-surface p-4">
      <span class="text-sm font-medium text-text-muted">Model</span>
      <div class="mt-3 grid grid-cols-3 gap-2">
        {#each ['Grok Imagine ✦', 'Grok 2 ◈', 'Grok Video ▶'] as model (model)}
          <div
            class="rounded-lg border border-border px-3 py-2 text-center text-xs font-medium text-text-muted transition-colors hover:border-border-active"
          >
            {model}
          </div>
        {/each}
      </div>
    </div>

    <!-- Prompt Placeholder -->
    <div class="rounded-xl border border-border bg-surface p-4">
      <span class="text-sm font-medium text-text-muted">Prompt</span>
      <textarea
        class="mt-2 w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
        rows={4}
        placeholder="Describe what you want to generate…"
        disabled
      ></textarea>
    </div>

    <!-- Params Placeholder -->
    <div class="rounded-xl border border-border bg-surface p-4">
      <span class="text-sm font-medium text-text-muted">Parameters</span>
      <div class="mt-3 flex flex-wrap gap-2">
        {#each ['1:1', '16:9', '9:16', '4:3', '3:4'] as ratio (ratio)}
          <span class="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-dim">
            {ratio}
          </span>
        {/each}
      </div>
    </div>
  </div>

  <!-- Results Panel -->
  <div class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 p-12">
    <div class="text-center">
      <p class="text-sm text-text-dim">Generated outputs will appear here</p>
      <p class="mt-1 text-xs text-text-dim">Coming in Phase 2</p>
    </div>
  </div>
</div>
