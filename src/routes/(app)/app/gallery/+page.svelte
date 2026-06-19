<script lang="ts">
  import { createInfiniteQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import {
    galleryListInfiniteQueryOptions,
    deleteContentMutationOptions,
  } from '$lib/queries/gallery';
  import apiClient from '$lib/api/client';
  import GalleryGrid from '$lib/components/gallery/GalleryGrid.svelte';
  import GalleryFilters from '$lib/components/gallery/GalleryFilters.svelte';
  import InfiniteScrollSentinel from '$lib/components/gallery/InfiniteScrollSentinel.svelte';
  import Lightbox from '$lib/components/gallery/Lightbox.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import { addToast } from '$lib/stores/toasts';
  import type { components } from '$lib/api/types';
  import type { GalleryMediaFilter } from '$lib/components/gallery/GalleryFilters.svelte';
  import { productInfo } from '$lib/stores/product';
  import * as m from '$paraglide/messages';

  type GalleryGridItem = components['schemas']['GalleryGridItem'];
  type GalleryGroupDetail = components['schemas']['GalleryGroupDetail'];
  type OutputMediaType = components['schemas']['OutputMediaType'];

  let filter = $state<GalleryMediaFilter>('all');
  let lightboxItem = $state<GalleryGridItem | null>(null);
  let deleteTarget = $state<GalleryGridItem | null>(null);

  // Derive app title from productInfo for <title> tag
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  // Map UI filter to API media_type param
  const mediaTypeParam = $derived<OutputMediaType | undefined>(
    filter === 'all' ? undefined : filter,
  );

  const galleryQuery = createInfiniteQuery(() =>
    galleryListInfiniteQueryOptions({ media_type: mediaTypeParam ?? null }),
  );

  const allItems = $derived((galleryQuery.data?.pages ?? []).flatMap((p) => p.items));

  const queryClient = useQueryClient();
  const deleteMutation = createMutation(() => deleteContentMutationOptions(queryClient));

  function handleFilterChange(f: GalleryMediaFilter) {
    filter = f;
  }

  function handleLoadMore() {
    if (galleryQuery.hasNextPage && !galleryQuery.isFetchingNextPage) {
      galleryQuery.fetchNextPage();
    }
  }

  function handleCardDelete(item: GalleryGridItem) {
    if (item.output_count > 1) {
      // Multi-output: open lightbox so user can select which output to delete
      lightboxItem = item;
    } else {
      // Single-output: show confirm dialog
      deleteTarget = item;
    }
  }

  async function confirmCardDelete() {
    if (!deleteTarget) return;
    try {
      const { data, error } = await apiClient.GET('/v1/gallery/{job_id}', {
        params: { path: { job_id: deleteTarget.job_id } },
      });
      const detail = data as GalleryGroupDetail | undefined;
      if (error || !detail?.outputs?.length) {
        addToast({ type: 'error', message: m.gallery_delete_error() });
        return;
      }
      await deleteMutation.mutateAsync(detail.outputs[0].id);
      addToast({ type: 'success', message: m.gallery_delete_success() });
    } catch {
      addToast({ type: 'error', message: m.gallery_delete_error() });
    } finally {
      deleteTarget = null;
    }
  }
</script>

<svelte:head>
  <title>Gallery — {appTitle}</title>
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
    <GalleryGrid
      items={allItems}
      onCardClick={(item) => (lightboxItem = item)}
      onCardDelete={handleCardDelete}
    />

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

{#if deleteTarget}
  <ConfirmDeleteModal
    title={m.gallery_delete_title()}
    message={m.gallery_delete_confirm_text()}
    isPending={deleteMutation.isPending}
    onconfirm={confirmCardDelete}
    oncancel={() => (deleteTarget = null)}
  />
{/if}
