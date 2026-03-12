<script lang="ts">
  export type GalleryFilter = 'all' | 'images' | 'videos';

  let {
    filter = 'all',
    counts,
    onchange,
  }: {
    filter?: GalleryFilter;
    counts: { all: number; images: number; videos: number };
    onchange: (f: GalleryFilter) => void;
  } = $props();

  const FILTERS: { key: GalleryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'images', label: 'Images' },
    { key: 'videos', label: 'Videos' },
  ];
</script>

<div class="flex items-center gap-2">
  {#each FILTERS as f (f.key)}
    {@const count = counts[f.key]}
    <button
      onclick={() => onchange(f.key)}
      class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors
        {filter === f.key
          ? 'bg-accent/15 text-accent'
          : 'border border-border text-text-muted hover:text-text'}"
    >
      {f.label}
      {#if count > 0}
        <span class="rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none">{count}</span>
      {/if}
    </button>
  {/each}
</div>
