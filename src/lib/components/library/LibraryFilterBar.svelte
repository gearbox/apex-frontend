<script module lang="ts">
  export type LibraryMediaFilter = 'all' | 'image' | 'video';
</script>

<script lang="ts">
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type LibraryTagListItem = components['schemas']['LibraryTagListItem'];

  let {
    mediaFilter,
    onMediaFilterChange,
    models,
    selectedModel,
    onModelChange,
    tags,
    selectedTagId,
    onTagChange,
    onManageTags,
  }: {
    mediaFilter: LibraryMediaFilter;
    onMediaFilterChange: (filter: LibraryMediaFilter) => void;
    models: string[];
    selectedModel: string | null;
    onModelChange: (model: string | null) => void;
    tags: LibraryTagListItem[];
    selectedTagId: string | null;
    onTagChange: (tagId: string | null) => void;
    onManageTags: () => void;
  } = $props();

  const mediaFilters: { key: LibraryMediaFilter; label: () => string }[] = [
    { key: 'all', label: () => m.library_filter_all() },
    { key: 'image', label: () => m.library_filter_images() },
    { key: 'video', label: () => m.library_filter_videos() },
  ];
</script>

<div class="flex flex-wrap items-center gap-2">
  <div class="flex gap-1">
    {#each mediaFilters as filter (filter.key)}
      <button
        onclick={() => onMediaFilterChange(filter.key)}
        class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors
          {mediaFilter === filter.key
          ? 'bg-accent/15 text-accent'
          : 'text-text-muted hover:text-text'}"
      >
        {filter.label()}
      </button>
    {/each}
  </div>

  {#if models.length > 0}
    <select
      value={selectedModel ?? ''}
      onchange={(e) => onModelChange((e.currentTarget as HTMLSelectElement).value || null)}
      class="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted"
    >
      <option value="">{m.library_filter_all_models()}</option>
      {#each models as model (model)}
        <option value={model}>{model}</option>
      {/each}
    </select>
  {/if}

  {#if tags.length > 0}
    <select
      value={selectedTagId ?? ''}
      onchange={(e) => onTagChange((e.currentTarget as HTMLSelectElement).value || null)}
      aria-label={m.library_filter_tags()}
      class="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted"
    >
      <option value="">{m.library_filter_all_tags()}</option>
      {#each tags as tag (tag.id)}
        <option value={tag.id}>{tag.name} ({tag.asset_count})</option>
      {/each}
    </select>
    <button
      type="button"
      onclick={onManageTags}
      class="rounded-full px-2 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text"
    >
      {m.library_tags_manage()}
    </button>
  {/if}
</div>
