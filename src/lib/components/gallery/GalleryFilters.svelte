<script lang="ts">
  export type GalleryMediaFilter = 'all' | 'image' | 'video';

  let {
    filter = 'all',
    onchange,
  }: {
    filter?: GalleryMediaFilter;
    onchange: (f: GalleryMediaFilter) => void;
  } = $props();

  const FILTERS: { key: GalleryMediaFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'image', label: 'Images' },
    { key: 'video', label: 'Videos' },
  ];
</script>

<div class="flex items-center gap-2">
  {#each FILTERS as f (f.key)}
    <button
      onclick={() => onchange(f.key)}
      class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors
        {filter === f.key
          ? 'bg-accent/15 text-accent'
          : 'border border-border text-text-muted hover:text-text'}"
    >
      {f.label}
    </button>
  {/each}
</div>
