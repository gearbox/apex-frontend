<script lang="ts">
  import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { Upload as UploadIcon } from 'lucide-svelte';
  import {
    uploadsInfiniteQueryOptions,
    storageStatsQueryOptions,
    storageKeys,
  } from '$lib/queries/storage';
  import { uploadImage } from '$lib/api/upload';
  import { ApiRequestError } from '$lib/api/errors';
  import { addToast } from '$lib/stores/toasts';
  import { timeAgo, timeUntil } from '$lib/utils/format';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import InfiniteScrollSentinel from '$lib/components/gallery/InfiniteScrollSentinel.svelte';
  import UploadLightbox from '$lib/components/uploads/UploadLightbox.svelte';
  import type { components } from '$lib/api/types';
  import { productInfo } from '$lib/stores/product';

  type ImageListItem = components['schemas']['ImageListItem'];

  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const EXPIRES_SOON_MS = 7 * 24 * 60 * 60 * 1000;

  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  let lightboxItem = $state<ImageListItem | null>(null);
  let uploading = $state(false);
  let fileInput: HTMLInputElement;

  const queryClient = useQueryClient();
  const uploadsQuery = createInfiniteQuery(() => uploadsInfiniteQueryOptions());
  const statsQuery = createQuery(() => storageStatsQueryOptions());

  const allItems = $derived((uploadsQuery.data?.pages ?? []).flatMap((p) => p.items));

  function isExpiringSoon(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() - Date.now() < EXPIRES_SOON_MS;
  }

  function handleLoadMore() {
    if (uploadsQuery.hasNextPage && !uploadsQuery.isFetchingNextPage) {
      uploadsQuery.fetchNextPage();
    }
  }

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      addToast({ type: 'error', message: 'Only PNG, JPEG, and WebP are supported' });
      if (fileInput) fileInput.value = '';
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      addToast({ type: 'error', message: 'File must be under 20 MB' });
      if (fileInput) fileInput.value = '';
      return;
    }

    uploading = true;
    try {
      await uploadImage(file);
      queryClient.invalidateQueries({ queryKey: storageKeys.all });
      addToast({ type: 'success', message: 'Upload complete' });
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : 'Upload failed. Please try again.';
      addToast({ type: 'error', message });
    } finally {
      uploading = false;
      if (fileInput) fileInput.value = '';
    }
  }
</script>

<svelte:head>
  <title>My Uploads — {appTitle}</title>
</svelte:head>

<div class="flex flex-col gap-4 p-4 md:p-0">
  <!-- Header -->
  <div class="flex items-center justify-between gap-3">
    <div>
      <h1 class="text-lg font-semibold text-text">My Uploads</h1>
      {#if statsQuery.data}
        <p class="text-xs text-text-dim">
          {statsQuery.data.upload_count} uploads · {statsQuery.data.total_mb.toFixed(1)} MB
        </p>
      {/if}
    </div>
    <button
      onclick={() => fileInput.click()}
      disabled={uploading}
      class="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
    >
      <UploadIcon size={14} />
      {uploading ? 'Uploading…' : 'Upload'}
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept={ACCEPTED_TYPES.join(',')}
      class="hidden"
      onchange={handleFileChange}
    />
  </div>

  {#if uploadsQuery.isLoading}
    <div class="grid grid-cols-3 gap-2 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
      {#each Array(9) as _, i (i)}
        <div class="aspect-square animate-pulse rounded-xl bg-surface"></div>
      {/each}
    </div>
  {:else if uploadsQuery.isError}
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20"
    >
      <p class="text-sm text-danger">Failed to load uploads</p>
      <button
        onclick={() => uploadsQuery.refetch()}
        class="mt-2 text-sm font-medium text-accent hover:underline"
      >
        Try again
      </button>
    </div>
  {:else if allItems.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20"
    >
      <p class="text-sm text-text-dim">No uploads yet</p>
      <button
        onclick={() => fileInput.click()}
        class="mt-2 text-sm font-medium text-accent hover:underline"
      >
        Upload an image
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-3 gap-2 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
      {#each allItems as item (item.id)}
        <button onclick={() => (lightboxItem = item)} class="group flex flex-col gap-1 text-left">
          <div
            class="aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface"
          >
            <MediaImage
              media={item.media}
              alt={item.filename}
              sizes="(max-width: 768px) 33vw, 160px"
              class="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
          <p class="truncate text-xs font-medium text-text">{item.filename}</p>
          <p class="text-[11px] text-text-dim">{timeAgo(item.created_at)}</p>
          {#if isExpiringSoon(item.expires_at)}
            <p class="text-[11px] text-warning">expires {timeUntil(item.expires_at)}</p>
          {/if}
        </button>
      {/each}
    </div>

    <InfiniteScrollSentinel
      onVisible={handleLoadMore}
      disabled={!uploadsQuery.hasNextPage || uploadsQuery.isFetchingNextPage}
    />

    {#if uploadsQuery.isFetchingNextPage}
      <div class="flex justify-center py-4">
        <div
          class="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
        ></div>
      </div>
    {:else if !uploadsQuery.hasNextPage && allItems.length > 0}
      <p class="py-4 text-center text-xs text-text-dim">All caught up</p>
    {/if}
  {/if}
</div>

{#if lightboxItem}
  <UploadLightbox item={lightboxItem} onclose={() => (lightboxItem = null)} />
{/if}
