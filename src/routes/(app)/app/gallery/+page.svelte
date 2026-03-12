<script lang="ts">
  import { createInfiniteQuery } from '@tanstack/svelte-query';
  import apiClient from '$lib/api/client';
  import { GALLERY_PAGE_SIZE } from '$lib/utils/constants';
  import GalleryGrid from '$lib/components/gallery/GalleryGrid.svelte';
  import GalleryFilters from '$lib/components/gallery/GalleryFilters.svelte';
  import InfiniteScrollSentinel from '$lib/components/gallery/InfiniteScrollSentinel.svelte';
  import Lightbox from '$lib/components/gallery/Lightbox.svelte';
  import type { components } from '$lib/api/types';
  import type { GalleryFilter } from '$lib/components/gallery/GalleryFilters.svelte';

  type JobSummaryResponse = components['schemas']['JobSummaryResponse'];

  let filter = $state<GalleryFilter>('all');
  let lightboxItem = $state<JobSummaryResponse | null>(null);

  const galleryQuery = createInfiniteQuery(() => ({
    queryKey: ['gallery'],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const { data } = await apiClient.GET('/v1/users/me/jobs', {
        params: { query: { limit: GALLERY_PAGE_SIZE, offset: pageParam } },
      });
      return data ?? { items: [], total: 0 };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: { items: JobSummaryResponse[]; total: number }, allPages: { items: JobSummaryResponse[]; total: number }[]) => {
      const loaded = allPages.reduce((acc, p) => acc + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: 0,
  }));

  const allItems = $derived(
    (galleryQuery.data?.pages ?? []).flatMap((p) => p.items),
  );

  const filteredItems = $derived(
    filter === 'all'
      ? allItems
      : filter === 'images'
        ? allItems.filter((i) => i.generation_type === 't2i' || i.generation_type === 'i2i')
        : allItems.filter((i) => i.generation_type === 't2v' || i.generation_type === 'i2v'),
  );

  const counts = $derived({
    all: allItems.length,
    images: allItems.filter((i) => i.generation_type === 't2i' || i.generation_type === 'i2i').length,
    videos: allItems.filter((i) => i.generation_type === 't2v' || i.generation_type === 'i2v').length,
  });

  function handleFilterChange(f: GalleryFilter) {
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
    <GalleryFilters {filter} {counts} onchange={handleFilterChange} />
    <span class="ml-auto text-xs text-text-dim">
      {filteredItems.length}{galleryQuery.hasNextPage ? '+' : ''} items
    </span>
  </div>

  {#if galleryQuery.isLoading}
    <div class="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
      {#each Array(8) as _, i (i)}
        <div class="aspect-square animate-pulse rounded-xl bg-surface"></div>
      {/each}
    </div>
  {:else if galleryQuery.isError}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20">
      <p class="text-sm text-danger">Failed to load gallery</p>
      <button
        onclick={() => galleryQuery.refetch()}
        class="mt-2 text-sm font-medium text-accent hover:underline"
      >
        Try again
      </button>
    </div>
  {:else if filteredItems.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20">
      <p class="text-sm text-text-dim">
        {filter === 'all' ? 'Your generated content will appear here' : `No ${filter} yet`}
      </p>
      <a href="/app/create" class="mt-2 text-sm font-medium text-accent hover:underline">
        Start creating
      </a>
    </div>
  {:else}
    <GalleryGrid items={filteredItems} onCardClick={(item) => (lightboxItem = item)} />

    <InfiniteScrollSentinel
      onVisible={handleLoadMore}
      disabled={!galleryQuery.hasNextPage || galleryQuery.isFetchingNextPage}
    />

    {#if galleryQuery.isFetchingNextPage}
      <div class="flex justify-center py-4">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
      </div>
    {:else if !galleryQuery.hasNextPage && filteredItems.length > 0}
      <p class="py-4 text-center text-xs text-text-dim">All caught up</p>
    {/if}
  {/if}
</div>

{#if lightboxItem}
  <Lightbox
    item={lightboxItem}
    allItems={filteredItems}
    onclose={() => (lightboxItem = null)}
  />
{/if}
