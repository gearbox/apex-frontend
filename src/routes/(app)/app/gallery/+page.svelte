<script lang="ts">
  import { createInfiniteQuery } from '@tanstack/svelte-query';
  import { galleryListInfiniteQueryOptions } from '$lib/queries/gallery';
  import GalleryGrid from '$lib/components/gallery/GalleryGrid.svelte';
  import GalleryFilters from '$lib/components/gallery/GalleryFilters.svelte';
  import InfiniteScrollSentinel from '$lib/components/gallery/InfiniteScrollSentinel.svelte';
  import Lightbox from '$lib/components/gallery/Lightbox.svelte';
  import type { components } from '$lib/api/types';
  import type { GalleryMediaFilter } from '$lib/components/gallery/GalleryFilters.svelte';

  type GalleryGridItem = components['schemas']['GalleryGridItem'];
  type OutputMediaType = components['schemas']['OutputMediaType'];

  let filter = $state<GalleryMediaFilter>('all');
  let lightboxItem = $state<GalleryGridItem | null>(null);

  // Map UI filter to API media_type param
  const mediaTypeParam = $derived<OutputMediaType | undefined>(
    filter === 'all' ? undefined : filter,
  );

  const galleryQuery = createInfiniteQuery(() =>
    galleryListInfiniteQueryOptions({ media_type: mediaTypeParam ?? null }),
  );

  const allItems = $derived((galleryQuery.data?.pages ?? []).flatMap((p) => p.items));

  function handleFilterChange(f: GalleryMediaFilter) {
    filter = f;
  }

  function handleLoadMore() {
    if (galleryQuery.hasNextPage && !galleryQuery.isFetchingNextPage) {
      galleryQuery.fetchNextPage();
    }
  }
</script>

<svelte:head>
  <title>Gallery — Apex</title>
</svelte:head>

<div class="flex flex-col gap-4 p-4 md:p-0">
  <!-- Filter bar -->
  <div class="flex items-center gap-2">
    <GalleryFilters {filter} onchange={handleFilterChange} />
    <span class="ml-auto text-xs text-text-dim">
      {allItems.length} loaded{galleryQuery.hasNextPage ? '+' : ''}
    </span>
  </div>

  {#if galleryQuery.isLoading}
    <div class="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
      {#each Array(8) as _, i (i)}
        <div class="aspect-square animate-pulse rounded-xl bg-surface"></div>
      {/each}
    </div>
  {:else if galleryQuery.isError}
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20"
    >
      <p class="text-sm text-danger">Failed to load gallery</p>
      <button
        onclick={() => galleryQuery.refetch()}
        class="mt-2 text-sm font-medium text-accent hover:underline"
      >
        Try again
      </button>
    </div>
  {:else if allItems.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20"
    >
      <p class="text-sm text-text-dim">
        {filter === 'all'
          ? 'Your generated content will appear here'
          : `No ${filter === 'image' ? 'images' : 'videos'} yet`}
      </p>
      <a href="/app/create" class="mt-2 text-sm font-medium text-accent hover:underline">
        Start creating
      </a>
    </div>
  {:else}
    <GalleryGrid items={allItems} onCardClick={(item) => (lightboxItem = item)} />

    <InfiniteScrollSentinel
      onVisible={handleLoadMore}
      disabled={!galleryQuery.hasNextPage || galleryQuery.isFetchingNextPage}
    />

    {#if galleryQuery.isFetchingNextPage}
      <div class="flex justify-center py-4">
        <div
          class="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
        ></div>
      </div>
    {:else if !galleryQuery.hasNextPage && allItems.length > 0}
      <p class="py-4 text-center text-xs text-text-dim">All caught up</p>
    {/if}
  {/if}
</div>

{#if lightboxItem}
  <Lightbox item={lightboxItem} {allItems} onclose={() => (lightboxItem = null)} />
{/if}
