<script lang="ts">
  // Phase 2: GalleryGrid, GalleryCard, GalleryFilters, Lightbox, infinite scroll
</script>

<svelte:head>
  <title>Gallery — Apex</title>
</svelte:head>

<div class="mx-auto max-w-6xl p-4 md:p-6">
  <h1 class="mb-4 text-xl font-semibold text-text">Gallery</h1>

  <!-- Filter bar -->
  <div class="mb-4 flex items-center gap-2">
    {#each ['All', 'Images', 'Videos'] as filter, i}
      <button
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors {i === 0
          ? 'bg-accent/15 text-accent'
          : 'border border-border text-text-muted hover:text-text'}"
      >
        {filter}
      </button>
    {/each}
    <span class="ml-auto text-xs text-text-dim">0 items</span>
  </div>

  <!-- Empty state -->
  <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20">
    <p class="text-sm text-text-dim">Your generated content will appear here</p>
    <a href="/app/create" class="mt-2 text-sm font-medium text-accent hover:underline">
      Start creating
    </a>
  </div>
</div>
