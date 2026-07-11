<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { X, Repeat2, Trash2 } from 'lucide-svelte';
  import { generationStore } from '$lib/stores/generation';
  import { deleteContentMutationOptions } from '$lib/queries/gallery';
  import { addToast } from '$lib/stores/toasts';
  import { ApiRequestError } from '$lib/api/errors';
  import { timeAgo, timeUntil, formatFileSize } from '$lib/utils/format';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { ROUTES } from '$lib/utils/routes';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type ImageListItem = components['schemas']['ImageListItem'];

  let {
    item,
    onclose,
  }: {
    item: ImageListItem;
    onclose: () => void;
  } = $props();

  let showDeleteConfirm = $state(false);

  const queryClient = useQueryClient();
  const deleteMutation = createMutation(() => deleteContentMutationOptions(queryClient));

  const expiresSoon = $derived(
    new Date(item.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000,
  );

  function handleUseInGeneration() {
    generationStore.setUploadedImageId(item.id);
    goto(ROUTES.create);
    onclose();
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(item.id);
      addToast({ type: 'success', message: m.upload_delete_success() });
      onclose();
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : m.upload_delete_error();
      addToast({ type: 'error', message });
      showDeleteConfirm = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    document.body.style.overflow = 'hidden';
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = '';
  });
</script>

{#snippet actionsBlock()}
  <div class="flex gap-2">
    <button
      onclick={handleUseInGeneration}
      class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
    >
      <Repeat2 size={13} /> Use in generation
    </button>

    <button
      onclick={() => (showDeleteConfirm = true)}
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-danger/30 text-danger transition-colors hover:bg-danger/10"
      aria-label={m.common_delete()}
      title={m.common_delete()}
    >
      <Trash2 size={13} />
    </button>
  </div>
{/snippet}

{#snippet detailsBlock()}
  <div class="flex flex-col gap-2">
    <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Details</p>
    <div class="flex flex-col gap-1 text-xs">
      <div class="flex justify-between gap-3">
        <span class="shrink-0 text-text-dim">Filename</span>
        <span class="truncate text-right font-medium text-text">{item.filename}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-text-dim">Dimensions</span>
        <span class="font-medium text-text">
          {item.media.original.width && item.media.original.height
            ? `${item.media.original.width} × ${item.media.original.height}`
            : 'Unknown'}
        </span>
      </div>
      <div class="flex justify-between">
        <span class="text-text-dim">Size</span>
        <span class="font-medium text-text">{formatFileSize(item.media.original.size_bytes)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-text-dim">Uploaded</span>
        <span class="font-medium text-text">{timeAgo(item.created_at)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-text-dim">Expires</span>
        <span class="font-medium {expiresSoon ? 'text-warning' : 'text-text'}"
          >{timeUntil(item.expires_at)}</span
        >
      </div>
    </div>
  </div>
{/snippet}

<!-- Backdrop -->
<div
  class="fixed inset-0 z-[150] flex flex-col bg-black/80 backdrop-blur-sm md:items-center md:justify-center md:p-4"
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose();
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') onclose();
  }}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label="Upload preview"
>
  <div
    class="flex h-full w-full flex-1 flex-col overflow-hidden bg-bg md:mx-auto md:h-auto md:max-h-[95dvh] md:flex-none md:w-full md:max-w-4xl md:flex-row md:rounded-2xl"
  >
    <!-- Media area -->
    <div class="relative flex min-h-0 flex-1 items-center justify-center bg-black md:min-h-[40vh]">
      <button
        onclick={onclose}
        class="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:top-4"
        aria-label="Close"
      >
        <X size={18} />
      </button>

      <MediaImage
        media={item.media}
        alt={item.filename}
        sizes="(max-width: 768px) 100vw, 66vw"
        loading="eager"
        class="max-h-[60vh] w-full object-contain md:max-h-full"
      />
    </div>

    <!-- Panel -->
    {#if $isDesktop}
      <div class="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto p-5">
        <p class="truncate text-sm font-medium leading-snug text-text">{item.filename}</p>
        {@render actionsBlock()}
        {@render detailsBlock()}
      </div>
    {:else}
      <div class="safe-bottom-padding flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3">
        {@render actionsBlock()}
        {@render detailsBlock()}
      </div>
    {/if}
  </div>
</div>

{#if showDeleteConfirm}
  <ConfirmDeleteModal
    title={m.upload_delete_title()}
    message={m.upload_delete_confirm_text()}
    isPending={deleteMutation.isPending}
    onconfirm={handleDelete}
    oncancel={() => (showDeleteConfirm = false)}
  />
{/if}
