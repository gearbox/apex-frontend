<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createInfiniteQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { X, Check, Trash2 } from 'lucide-svelte';
  import {
    libraryListInfiniteQueryOptions,
    libraryAssetQueryOptions,
    deleteAssetMutationOptions,
  } from '$lib/queries/library';
  import { addToast } from '$lib/stores/toasts';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { parseAssetRef } from '$lib/utils/assetRef';
  import type { components } from '$lib/api/types';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import { mediaFallbackSrc } from '$lib/media/index';
  import InfiniteScrollSentinel from '$lib/components/shared/InfiniteScrollSentinel.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import * as m from '$paraglide/messages';

  type LibraryAssetItem = components['schemas']['LibraryAssetItem'];

  export interface ImagePickerSelection {
    source: 'upload' | 'output';
    id: string;
    previewUrl: string;
    prompt?: string | null;
  }

  let {
    open,
    onclose,
    onselect,
  }: {
    open: boolean;
    onclose: () => void;
    onselect: (selection: ImagePickerSelection) => void;
  } = $props();

  let activeTab = $state<'uploads' | 'generated'>('uploads');
  let selectedItem = $state<LibraryAssetItem | null>(null);
  let uploadDeleteTarget = $state<LibraryAssetItem | null>(null);
  let confirming = $state(false);

  const queryClient = useQueryClient();
  const deleteUploadMut = createMutation(() => deleteAssetMutationOptions(queryClient));

  // Long-press timer for mobile upload deletion
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  /* ─── Data fetching ─── */
  // Both queries always enabled when the modal is open so tab-switching never
  // triggers a loading skeleton flash — data is already in cache.

  const uploadsQuery = createInfiniteQuery(() => ({
    ...libraryListInfiniteQueryOptions({ source: 'upload', media_type: 'image' }),
    enabled: open,
  }));

  const generatedQuery = createInfiniteQuery(() => ({
    ...libraryListInfiniteQueryOptions({ source: 'output', media_type: 'image' }),
    enabled: open,
  }));

  const uploadItems = $derived((uploadsQuery.data?.pages ?? []).flatMap((p) => p.items));
  const generatedItems = $derived((generatedQuery.data?.pages ?? []).flatMap((p) => p.items));

  /* ─── Confirm ─── */

  async function handleConfirm() {
    if (!selectedItem || confirming) return;
    const item = selectedItem;
    const { source, id } = parseAssetRef(item.asset_ref);
    const previewUrl = mediaFallbackSrc(item.media, 512);

    if (source === 'upload') {
      onselect({ source: 'upload', id, previewUrl });
      return;
    }

    // Fetch the asset detail to auto-fill the prompt used to generate it.
    confirming = true;
    try {
      const detail = await queryClient.fetchQuery(libraryAssetQueryOptions(item.asset_ref));
      onselect({ source: 'output', id, previewUrl, prompt: detail.prompt });
    } catch {
      onselect({ source: 'output', id, previewUrl });
    } finally {
      confirming = false;
    }
  }

  /* ─── Upload deletion ─── */

  async function confirmUploadDelete() {
    if (!uploadDeleteTarget) return;
    const target = uploadDeleteTarget;
    try {
      await deleteUploadMut.mutateAsync(target.asset_ref);
      addToast({ type: 'success', message: m.upload_delete_success() });
      if (selectedItem?.asset_ref === target.asset_ref) {
        selectedItem = null;
      }
    } catch {
      addToast({ type: 'error', message: m.upload_delete_error() });
    } finally {
      uploadDeleteTarget = null;
    }
  }

  function startLongPress(item: LibraryAssetItem) {
    longPressTimer = setTimeout(() => {
      uploadDeleteTarget = item;
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  /* ─── Keyboard handler ─── */

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  onMount(() => {
    // Do NOT set document.body.style.overflow = 'hidden' — that removes the
    // scrollbar and causes a layout-shift flicker on open. The fixed backdrop
    // covers the full screen so background scrolling is effectively blocked.
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 pb-[calc(56px+env(safe-area-inset-bottom))] md:items-center md:justify-center md:pb-0"
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose();
  }}
  onkeydown={(e) => {
    if (e.target === e.currentTarget && e.key === 'Enter') onclose();
  }}
  role="presentation"
>
  <!--
    Panel.
    Mobile: h-[85svh] gives a DEFINITE height so that the internal flex-1
    on the content area correctly distributes remaining space and the footer
    button is always pinned to the bottom. max-h alone is not a definite
    height in CSS flex terms — flex-1 has nothing to fill, content expands
    to natural size, and overflow-hidden clips the footer.
    Desktop: md:h-auto md:max-h-[80vh] — the column-flex parent (fixed
    inset-0 → 100 vh) makes the panel's resolved height definite when
    content overflows, so flex-1 still works there.
  -->
  <div
    class="flex h-[85svh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface
           md:h-auto md:max-h-[80vh] md:max-w-160 md:rounded-2xl"
    role="dialog"
    aria-modal="true"
    aria-label="Choose from library"
    tabindex="-1"
  >
    <!-- Header -->
    <div class="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
      <h2 class="text-sm font-semibold text-text">Choose from Library</h2>
      <button
        onclick={onclose}
        class="rounded-md p-1 text-text-muted transition-colors hover:text-text"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>

    <!-- Tab bar -->
    <div class="flex shrink-0 gap-1 border-b border-border px-5 py-2">
      {#each [['uploads', 'Uploads'], ['generated', 'Generated']] as [key, label] (key)}
        <button
          onclick={() => {
            activeTab = key as 'uploads' | 'generated';
            selectedItem = null;
          }}
          class="rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors
            {activeTab === key ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text'}"
          role="tab"
          aria-selected={activeTab === key}
        >
          {label}
        </button>
      {/each}
    </div>

    <!-- Content area: scrollable, min-h-0 lets flex-1 shrink below content size -->
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      {#if activeTab === 'uploads'}
        {#if uploadsQuery.isLoading}
          <div class="grid grid-cols-3 gap-2 md:grid-cols-4">
            {#each Array(12) as _, i (i)}
              <div class="aspect-square animate-pulse rounded-lg bg-bg"></div>
            {/each}
          </div>
        {:else if uploadItems.length === 0}
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <p class="text-sm text-text-dim">No uploads yet</p>
            <p class="mt-1 text-xs text-text-muted">
              Upload an image using the drag & drop zone above
            </p>
          </div>
        {:else}
          <div class="grid grid-cols-3 gap-2 md:grid-cols-4">
            {#each uploadItems as item (item.asset_ref)}
              {@const isSelected = selectedItem?.asset_ref === item.asset_ref}
              <div
                class="group relative aspect-square overflow-hidden rounded-lg border-2 transition-colors
                  {isSelected ? 'border-accent' : 'border-transparent hover:border-border-active'}"
              >
                <button
                  onclick={() => (selectedItem = isSelected ? null : item)}
                  ontouchstart={() => {
                    if (!$isDesktop) startLongPress(item);
                  }}
                  ontouchend={cancelLongPress}
                  ontouchmove={cancelLongPress}
                  ontouchcancel={cancelLongPress}
                  class="h-full w-full"
                  aria-pressed={isSelected}
                  aria-label="Upload: {item.original_filename ?? ''}"
                >
                  <MediaImage
                    media={item.media}
                    alt={item.original_filename ?? ''}
                    sizes="(max-width: 768px) 33vw, 25vw"
                    class="h-full w-full object-cover"
                  />
                  {#if isSelected}
                    <div class="absolute inset-0 flex items-center justify-center bg-accent/20">
                      <Check size={20} class="text-accent" />
                    </div>
                  {/if}
                </button>

                <!-- Desktop hover trash icon -->
                {#if $isDesktop}
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      uploadDeleteTarget = item;
                    }}
                    class="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:flex group-hover:opacity-100"
                    aria-label={m.common_delete()}
                  >
                    <Trash2 size={12} />
                  </button>
                {/if}
              </div>
            {/each}
          </div>

          <InfiniteScrollSentinel
            onVisible={() => {
              if (uploadsQuery.hasNextPage && !uploadsQuery.isFetchingNextPage) {
                uploadsQuery.fetchNextPage();
              }
            }}
            disabled={!uploadsQuery.hasNextPage || uploadsQuery.isFetchingNextPage}
          />

          {#if uploadsQuery.isFetchingNextPage}
            <div class="flex justify-center py-3">
              <div
                class="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
              ></div>
            </div>
          {/if}
        {/if}
      {:else}
        <!-- Generated tab -->
        {#if generatedQuery.isLoading}
          <div class="grid grid-cols-3 gap-2 md:grid-cols-4">
            {#each Array(12) as _, i (i)}
              <div class="aspect-square animate-pulse rounded-lg bg-bg"></div>
            {/each}
          </div>
        {:else if generatedItems.length === 0}
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <p class="text-sm text-text-dim">No generated images yet</p>
            <p class="mt-1 text-xs text-text-muted">Create your first image to see it here</p>
          </div>
        {:else}
          <div class="grid grid-cols-3 gap-2 md:grid-cols-4">
            {#each generatedItems as item (item.asset_ref)}
              {@const isSelected = selectedItem?.asset_ref === item.asset_ref}
              <button
                onclick={() => (selectedItem = isSelected ? null : item)}
                class="group relative aspect-square overflow-hidden rounded-lg border-2 transition-colors
                  {isSelected ? 'border-accent' : 'border-transparent hover:border-border-active'}"
                aria-pressed={isSelected}
                aria-label="Generated image"
              >
                <MediaImage
                  media={item.media}
                  alt=""
                  sizes="(max-width: 768px) 33vw, 25vw"
                  class="h-full w-full object-cover"
                />
                {#if isSelected}
                  <div class="absolute inset-0 flex items-center justify-center bg-accent/20">
                    <Check size={20} class="text-accent" />
                  </div>
                {/if}
              </button>
            {/each}
          </div>

          <InfiniteScrollSentinel
            onVisible={() => {
              if (generatedQuery.hasNextPage && !generatedQuery.isFetchingNextPage) {
                generatedQuery.fetchNextPage();
              }
            }}
            disabled={!generatedQuery.hasNextPage || generatedQuery.isFetchingNextPage}
          />

          {#if generatedQuery.isFetchingNextPage}
            <div class="flex justify-center py-3">
              <div
                class="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
              ></div>
            </div>
          {/if}
        {/if}
      {/if}
    </div>

    <!-- Footer: confirm button — always visible because panel has definite height -->
    <div class="shrink-0 border-t border-border px-5 py-4">
      <button
        onclick={handleConfirm}
        disabled={!selectedItem || confirming}
        class="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors
          {selectedItem && !confirming
          ? 'bg-accent text-white hover:bg-accent/90'
          : 'cursor-not-allowed bg-surface text-text-dim'}"
      >
        {confirming ? 'Loading…' : 'Use Selected Image'}
      </button>
    </div>
  </div>
</div>

{#if uploadDeleteTarget}
  <ConfirmDeleteModal
    title={m.upload_delete_title()}
    message={m.upload_delete_confirm_text()}
    isPending={deleteUploadMut.isPending}
    onconfirm={confirmUploadDelete}
    oncancel={() => (uploadDeleteTarget = null)}
  />
{/if}
